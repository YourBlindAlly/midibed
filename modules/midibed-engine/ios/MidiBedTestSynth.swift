import Foundation
import AVFoundation
import UIKit
import os

/// Tiny built-in synth so the app can be heard with no routing to AUM etc.
/// Pads: two detuned saws -> one-pole lowpass (cutoff follows CC 74) -> slow
/// attack/release envelope. Drums: sine kick, noise snare/hats, a short perc blip.
///
/// The AVAudioEngine runs for the app's whole life, even when `enabled` is
/// false (it then renders silence). That is deliberate: a running audio engine is
/// what lets the "audio" background mode keep the MIDI scheduler alive while
/// another app is in front.
///
/// Threading: `post` is called from the engine's timer queue; the render block
/// runs on the audio thread. A small fixed ring of events is shared under an
/// os_unfair_lock; the audio thread only try-locks (skips draining this buffer if
/// the writer holds it), so it never blocks.
final class MidiBedTestSynth {
  private struct Event {
    var status: UInt8 = 0
    var d1: UInt8 = 0
    var d2: UInt8 = 0
  }

  private struct PadVoice {
    var active = false
    var gate = false
    var note: Int = 0
    var phaseA: Float = 0
    var phaseB: Float = 0
    var env: Float = 0
    var velocity: Float = 0
    var ic1: Float = 0   // state-variable filter integrators
    var ic2: Float = 0
    var age: Int = 0
    var channel: UInt8 = 0
  }

  /// One drum hit. `kind`: 0 kick, 1 snare, 2 rim click, 3 clap, 4 closed hat, 5 open hat, 6 shaker, 7 tom,
  /// 8 wood block, 9 tambourine, 10 low tom, 11 mid tom, 12 high tom, 13 jingle tambourine (the same numbers as DRUM_TYPES in src/drumvoice.ts). tune/decay/tone/snap/level come from the
  /// drum's settings; the recipes were designed and level-checked offline (scratchpad drum_check.py).
  private struct DrumVoice {
    var active = false
    var kind: Int = 0
    var t: Float = 0    // seconds since trigger
    var velocity: Float = 0
    var phase: Float = 0
    var hpPrev: Float = 0
    var xPrev: Float = 0
    var hp2Prev: Float = 0
    var xPrev2: Float = 0
    var lp: Float = 0
    var lp2: Float = 0
    var tuneRatio: Float = 1
    var decay: Float = 1
    var tone: Float = 0.5
    var snap: Float = 0.5
    var level: Float = 1
  }

  /// A drum's settings, looked up by MIDI note on channel 10. Without one, the General MIDI note decides.
  private struct DrumPatch {
    var valid = false
    var kind = 0
    var tune: Float = 0
    var decay: Float = 1
    var tone: Float = 0.5
    var snap: Float = 0.5
    var level: Float = 1
  }

  private let engine = AVAudioEngine()
  private var sourceNode: AVAudioSourceNode?
  private var sampleRate: Float = 44100

  private let lock: UnsafeMutablePointer<os_unfair_lock_s>
  private let capacity = 512
  private var ring: UnsafeMutablePointer<Event>
  private var readIndex = 0
  private var writeIndex = 0

  // Audio-thread-only state.
  private var pads: UnsafeMutablePointer<PadVoice>
  private var drums: UnsafeMutablePointer<DrumVoice>
  private var drumPatches: UnsafeMutablePointer<DrumPatch>
  private let padCount = 16
  private let drumCount = 8

  // Transition noise (see "Transition noise" below). Its commands travel in their own
  // small ring, protected by the same lock as the MIDI events.
  private let noiseCapacity = 32
  private var noiseRing: UnsafeMutablePointer<NoiseCommand>
  private var noiseRead = 0
  private var noiseWrite = 0
  private let noiseVoiceCount = 4
  private var noiseVoices: UnsafeMutablePointer<NoiseVoice>
  private var cutoffCC: Float = 70   // CC 74, pad channels
  private var resonanceCC: Float = 70 // CC 71, pad channels
  private var drumCutoffCC: Float = 127 // CC 74 on channel 10: wide open by default
  private var drumResonanceCC: Float = 0 // CC 71 on channel 10
  private var drumIc1: Float = 0 // drum-bus filter state
  private var drumIc2: Float = 0
  // Per-channel volume (CC 7 / CC 11), smoothed so fades have no zipper noise.
  private var expTarget: UnsafeMutablePointer<Float>
  private var expCurrent: UnsafeMutablePointer<Float>
  private var noiseState: UInt32 = 0x1234_5678
  private var padAgeCounter = 0

  /// Written from the control side, read on the audio thread. A stale read for
  /// one buffer is harmless, so no lock.
  var enabled: Bool = true

  // The bass voice (BassVoice.swift): when on, notes on `bassChannel` play it instead of a pad voice.
  // With `bassExclusive` the built-in sound plays ONLY that channel (no pads, drums or other channels).
  private let bass = BassVoice()
  /// The built-in effects (UglyFX.swift) and which part each MIDI channel belongs to
  /// (0 bass, 1 pad, 2 MidiDancer; drums are always part 3).
  let fx = UglyFX()
  private var partOfChannel = [Int](repeating: 1, count: 16)

  // Filter presets (see setFilterTargets): per part 0 bass, 1 pad, 2 MidiDancer, 3 drums.
  private let fMode = UnsafeMutablePointer<Int>.allocate(capacity: 4)        // wanted: 0 none, 1 LP, 2 HP, 3 BP
  private let fTarget = UnsafeMutablePointer<Float>.allocate(capacity: 4)    // wanted Hz
  private let fRes = UnsafeMutablePointer<Float>.allocate(capacity: 4)       // wanted resonance 0...1
  private let fCur = UnsafeMutablePointer<Float>.allocate(capacity: 4)       // where the glide is (Hz)
  private let fResCur = UnsafeMutablePointer<Float>.allocate(capacity: 4)
  private let fActive = UnsafeMutablePointer<Bool>.allocate(capacity: 4)
  private let fReturning = UnsafeMutablePointer<Bool>.allocate(capacity: 4)
  private var fGlide: Float = 0.7
  // The filter coefficients and mode in use for each part this buffer.
  private let fcA1 = UnsafeMutablePointer<Float>.allocate(capacity: 4)
  private let fcA2 = UnsafeMutablePointer<Float>.allocate(capacity: 4)
  private let fcA3 = UnsafeMutablePointer<Float>.allocate(capacity: 4)
  private let fcK = UnsafeMutablePointer<Float>.allocate(capacity: 4)
  private let fcMode = UnsafeMutablePointer<Int>.allocate(capacity: 4)
  private var bassIc1: Float = 0
  private var bassIc2: Float = 0
  var bassOn = false
  var bassExclusive = false
  var bassChannel = -1

  /// Control side: the drums' sound settings, by MIDI note. Replaces the whole table.
  func configureDrums(_ list: [(note: Int, kind: Int, tune: Float, decay: Float, tone: Float, snap: Float, level: Float)]) {
    for i in 0..<128 { drumPatches[i] = DrumPatch() }
    for d in list where d.note >= 0 && d.note < 128 {
      drumPatches[d.note] = DrumPatch(valid: true, kind: max(0, min(13, d.kind)), tune: d.tune, decay: d.decay, tone: d.tone, snap: d.snap, level: d.level)
    }
  }

  /// Control side: filter presets per part (bass, pad, MidiDancer, drums). mode 0 puts a part back on its
  /// normal filter (CC 74 and 71), gliding there. `glide` is the time to arrive, in seconds.
  func setFilterTargets(glide: Float, parts: [(mode: Int, hz: Float, res: Float)]) {
    fGlide = max(0, min(30, glide))
    for i in 0..<4 {
      if i < parts.count {
        fMode[i] = max(0, min(3, parts[i].mode))
        fTarget[i] = max(20, min(20000, parts[i].hz))
        fRes[i] = max(0, min(1, parts[i].res))
      } else {
        fMode[i] = 0
      }
    }
  }

  /// Control side: which MIDI channel each pitched part plays on, so each can have its own effects.
  func setPartChannels(bass b: Int, pad p: Int, dancer d: Int) {
    var map = [Int](repeating: 1, count: 16)
    for (ch, part) in [(p, 1), (d, 2), (b, 0)] where ch >= 0 && ch < 16 { map[ch] = part }
    partOfChannel = map
  }

  /// Control side: switch the bass voice on or off and give it its settings (BassParam order).
  func configureBass(on: Bool, exclusive: Bool, values: [Float]) {
    let wasOn = bassOn
    for i in 0..<min(values.count, BassParam.count) { bass.params[i] = values[i] }
    bassExclusive = exclusive
    bassOn = on
    if wasOn && !on { post(status: 0xB0 | UInt8(max(0, min(15, bassChannel))), d1: 123, d2: 0) }
  }

  init() {
    lock = UnsafeMutablePointer<os_unfair_lock_s>.allocate(capacity: 1)
    lock.initialize(to: os_unfair_lock_s())
    ring = UnsafeMutablePointer<Event>.allocate(capacity: capacity)
    ring.initialize(repeating: Event(), count: capacity)
    pads = UnsafeMutablePointer<PadVoice>.allocate(capacity: padCount)
    pads.initialize(repeating: PadVoice(), count: padCount)
    drums = UnsafeMutablePointer<DrumVoice>.allocate(capacity: drumCount)
    drums.initialize(repeating: DrumVoice(), count: drumCount)
    drumPatches = UnsafeMutablePointer<DrumPatch>.allocate(capacity: 128)
    drumPatches.initialize(repeating: DrumPatch(), count: 128)
    expTarget = UnsafeMutablePointer<Float>.allocate(capacity: 16)
    expTarget.initialize(repeating: 1, count: 16)
    expCurrent = UnsafeMutablePointer<Float>.allocate(capacity: 16)
    expCurrent.initialize(repeating: 1, count: 16)
    noiseRing = UnsafeMutablePointer<NoiseCommand>.allocate(capacity: noiseCapacity)
    noiseRing.initialize(repeating: NoiseCommand(), count: noiseCapacity)
    noiseVoices = UnsafeMutablePointer<NoiseVoice>.allocate(capacity: noiseVoiceCount)
    noiseVoices.initialize(repeating: NoiseVoice(), count: noiseVoiceCount)
    fMode.initialize(repeating: 0, count: 4)
    fTarget.initialize(repeating: 1000, count: 4)
    fRes.initialize(repeating: 0, count: 4)
    fCur.initialize(repeating: 1000, count: 4)
    fResCur.initialize(repeating: 0, count: 4)
    fActive.initialize(repeating: false, count: 4)
    fReturning.initialize(repeating: false, count: 4)
    fcA1.initialize(repeating: 0, count: 4)
    fcA2.initialize(repeating: 0, count: 4)
    fcA3.initialize(repeating: 0, count: 4)
    fcK.initialize(repeating: 1, count: 4)
    fcMode.initialize(repeating: 0, count: 4)
  }

  deinit {
    engine.stop()
    ring.deallocate()
    lock.deallocate()
    pads.deallocate()
    drums.deallocate()
    drumPatches.deallocate()
    expTarget.deallocate()
    expCurrent.deallocate()
    noiseRing.deallocate()
    noiseVoices.deallocate()
    fMode.deallocate()
    fTarget.deallocate()
    fRes.deallocate()
    fCur.deallocate()
    fResCur.deallocate()
    fActive.deallocate()
    fReturning.deallocate()
    fcA1.deallocate()
    fcA2.deallocate()
    fcA3.deallocate()
    fcK.deallocate()
    fcMode.deallocate()
  }

  func startEngine() {
    guard sourceNode == nil else { return }

    let session = AVAudioSession.sharedInstance()
    // mixWithOthers: don't cut off AUM / other audio apps playing at the same time.
    try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    try? session.setActive(true)

    let format = engine.outputNode.inputFormat(forBus: 0)
    sampleRate = Float(format.sampleRate > 0 ? format.sampleRate : 44100)
    let renderFormat = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 2)
    bass.setSampleRate(sampleRate)
    fx.setSampleRate(sampleRate)

    let node = AVAudioSourceNode(format: renderFormat ?? format) { [unowned self] _, _, frameCount, audioBufferList -> OSStatus in
      self.render(frameCount: Int(frameCount), bufferList: audioBufferList)
      return noErr
    }
    sourceNode = node
    engine.attach(node)
    engine.connect(node, to: engine.mainMixerNode, format: renderFormat ?? format)
    engine.mainMixerNode.outputVolume = 0.8
    restart()
    observeAudioChanges()
  }

  private var observing = false

  /// iOS stops the engine whenever the output route changes (Bluetooth
  /// connecting or disconnecting, headphones, etc.). Without a restart the synth
  /// stays silent for good while VoiceOver, which uses a separate path, keeps
  /// talking. Also covers returning to the foreground and media-services resets.
  private func observeAudioChanges() {
    guard !observing else { return }
    observing = true
    let nc = NotificationCenter.default
    nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
      self?.scheduleRestart()
    }
    nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
      self?.scheduleRestart()
    }
    nc.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
      self?.rebuild()
    }
    nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.restart()
    }
  }

  private func scheduleRestart() {
    // Let the new route settle before restarting.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      self?.restart()
    }
  }

  private func restart(attempt: Int = 0) {
    try? AVAudioSession.sharedInstance().setActive(true)
    if engine.isRunning { return }
    do {
      try engine.start()
    } catch {
      NSLog("MidiBedTestSynth: engine start failed (attempt \(attempt)): \(error)")
      if attempt < 6 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
          self?.restart(attempt: attempt + 1)
        }
      }
    }
  }

  private func rebuild() {
    engine.stop()
    if let node = sourceNode {
      engine.detach(node)
    }
    sourceNode = nil
    startEngine()
  }

  /// Restarts the engine after an audio-session interruption (phone call etc.).
  func restartIfNeeded() {
    restart()
  }

  /// Called from the control side with raw MIDI bytes.
  func post(status: UInt8, d1: UInt8, d2: UInt8) {
    os_unfair_lock_lock(lock)
    let next = (writeIndex + 1) % capacity
    if next != readIndex {
      ring[writeIndex] = Event(status: status, d1: d1, d2: d2)
      writeIndex = next
    }
    os_unfair_lock_unlock(lock)
  }

  /// Start one transition sound. `pre` seconds lead up to the bar line, `post` seconds
  /// follow it; `offset` is how far into the lead-up to begin (a late trigger joins the
  /// sweep part-way instead of starting from the beginning).
  func postNoise(shape: Int, color: Int, pre: Double, post: Double, offset: Double, level: Double) {
    os_unfair_lock_lock(lock)
    let next = (noiseWrite + 1) % noiseCapacity
    if next != noiseRead {
      noiseRing[noiseWrite] = NoiseCommand(
        shape: shape, color: color, pre: Float(pre), post: Float(post), offset: Float(offset), level: Float(level))
      noiseWrite = next
    }
    os_unfair_lock_unlock(lock)
  }

  // MARK: - Audio thread

  private func drainEvents() {
    guard os_unfair_lock_trylock(lock) else { return }
    while readIndex != writeIndex {
      let e = ring[readIndex]
      readIndex = (readIndex + 1) % capacity
      handle(e)
    }
    while noiseRead != noiseWrite {
      let c = noiseRing[noiseRead]
      noiseRead = (noiseRead + 1) % noiseCapacity
      startNoise(c)
    }
    os_unfair_lock_unlock(lock)
  }

  private func handle(_ e: Event) {
    let type = e.status & 0xF0
    let channel = e.status & 0x0F
    let isBass = bassOn && Int(channel) == bassChannel
    // Exclusive: only the bass voice's channel plays; everything else is ignored (controls still apply).
    let muted = bassOn && bassExclusive && !isBass
    switch type {
    case 0x90 where e.d2 > 0:
      if muted { return }
      if isBass {
        bass.noteOn(note: Int(e.d1), velocity: Float(e.d2) / 127)
      } else {
        noteOn(channel: channel, note: Int(e.d1), velocity: Float(e.d2) / 127)
      }
    case 0x80, 0x90:
      if isBass { bass.noteOff(note: Int(e.d1)) } else { noteOff(channel: channel, note: Int(e.d1)) }
    case 0xB0:
      if e.d1 == 74 {
        if channel == 9 { drumCutoffCC = Float(e.d2) } else { cutoffCC = Float(e.d2) }
        if isBass { bass.cutoffCC = Float(e.d2) }
      }
      if e.d1 == 71 {
        if channel == 9 { drumResonanceCC = Float(e.d2) } else { resonanceCC = Float(e.d2) }
        if isBass { bass.resonanceCC = Float(e.d2) }
      }
      if e.d1 == 7 || e.d1 == 11 { expTarget[Int(channel)] = Float(e.d2) / 127 }
      if e.d1 == 123 || e.d1 == 120 {
        allNotesOff()
        bass.allNotesOff()
      }
    default:
      break
    }
  }

  private func noteOn(channel: UInt8, note: Int, velocity: Float) {
    if channel == 9 {
      var v = DrumVoice(active: true, kind: 8, t: 0, velocity: velocity)
      let patch = drumPatches[max(0, min(127, note))]
      if patch.valid {
        v.kind = patch.kind
        v.tuneRatio = powf(2, patch.tune / 12)
        v.decay = patch.decay
        v.tone = patch.tone
        v.snap = patch.snap
        v.level = patch.level
      } else {
        // No settings for this note: the General MIDI drum map decides.
        switch note {
        case 35, 36: v.kind = 0
        case 37: v.kind = 2
        case 38, 40: v.kind = 1
        case 39: v.kind = 3
        case 41, 43: v.kind = 10
        case 45, 47: v.kind = 11
        case 48, 50: v.kind = 12
        case 42, 44: v.kind = 4
        case 46: v.kind = 5
        case 54: v.kind = 9
        case 70, 82: v.kind = 6
        default: v.kind = 8
        }
      }
      // Reuse a free voice, else steal the first one.
      var slot = 0
      for i in 0..<drumCount where !drums[i].active { slot = i; break }
      drums[slot] = v
      return
    }
    padAgeCounter += 1
    var slot = -1
    for i in 0..<padCount where !pads[i].active { slot = i; break }
    if slot < 0 {
      // Steal a voice that is already dying away (quietest first); only if every voice is held, the oldest.
      var quiet = -1
      for i in 0..<padCount where !pads[i].gate && (quiet < 0 || pads[i].env < pads[quiet].env) { quiet = i }
      if quiet >= 0 {
        slot = quiet
      } else {
        var oldest = 0
        for i in 0..<padCount where pads[i].age < pads[oldest].age { oldest = i }
        slot = oldest
      }
    }
    pads[slot] = PadVoice(active: true, gate: true, note: note, phaseA: 0, phaseB: 0.37, env: 0, velocity: velocity, ic1: 0, ic2: 0, age: padAgeCounter, channel: channel)
  }

  private func noteOff(channel: UInt8, note: Int) {
    if channel == 9 { return }
    // The CHANNEL must match too: the same pitch can be playing on two channels at once (a pad's fifth and a
    // MidiDancer or bass note), and a note-off for one must not release the other.
    for i in 0..<padCount where pads[i].active && pads[i].gate && pads[i].note == note && pads[i].channel == channel {
      pads[i].gate = false
    }
  }

  private func allNotesOff() {
    for i in 0..<padCount { pads[i].gate = false }
  }

  @inline(__always)
  private func nextNoise() -> Float {
    noiseState ^= noiseState << 13
    noiseState ^= noiseState >> 17
    noiseState ^= noiseState << 5
    return Float(Int32(bitPattern: noiseState)) / Float(Int32.max)
  }

  // MARK: - Transition noise

  private struct NoiseCommand {
    var shape: Int = 0
    var color: Int = 0
    var pre: Float = 0
    var post: Float = 0
    var offset: Float = 0
    var level: Float = 0
  }

  private struct NoiseVoice {
    var active = false
    var shape = 0
    var color = 0
    var t: Float = 0
    var pre: Float = 0
    var post: Float = 0
    var level: Float = 0
    var ic1: Float = 0
    var ic2: Float = 0
    var b0: Float = 0
    var b1: Float = 0
    var b2: Float = 0
    var brown: Float = 0
    var hpState: Float = 0
    var phase: Float = 0
  }

  /// Level correction per shape (rows: Wave, Wind, Thunder, Boom, Crash) and colour
  /// (columns: white, pink, brown). Measured offline so every combination comes out at a
  /// similar loudness: a low-passed white Thunder or a high-passed brown Crash would
  /// otherwise be nearly silent next to the pink versions.
  ///
  /// Version 2 scale: every noise shape is about five times quieter than it was, and the
  /// Boom (mostly deep bass a phone barely reproduces) is unchanged, so at the same level
  /// setting they now sit closer together in how loud they SEEM. Rusty was setting the
  /// noise shapes to 5% and the Boom much higher.
  private let noiseGains: [Float] = [
    0.46, 0.17, 0.46,
    0.48, 0.24, 0.64,
    1.6, 0.24, 0.5,
    1.1, 1.1, 1.1,
    0.7, 0.7, 2.0,
  ]

  private func startNoise(_ c: NoiseCommand) {
    var slot = 0
    for i in 0..<noiseVoiceCount where !noiseVoices[i].active { slot = i; break }
    noiseVoices[slot] = NoiseVoice(
      active: true, shape: c.shape, color: c.color, t: c.offset, pre: c.pre, post: c.post, level: c.level)
  }

  /// One sample of one transition voice. Shapes (the bar line is at t = pre):
  /// 0 Wave: swells up into the bar line and falls away after it.
  /// 1 Wind: filtered noise rises into the bar line, then a short cut.
  /// 2 Thunder: low rumble rolling in on the bar, slowly fading.
  /// 3 Boom: a low thump on the bar.
  /// 4 Crash: a bright burst on the bar that closes and fades.
  @inline(__always)
  private func renderNoise(_ i: Int, dt: Float, sr: Float) -> Float {
    let t = noiseVoices[i].t
    let pre = noiseVoices[i].pre
    let post = noiseVoices[i].post
    if t >= pre + post {
      noiseVoices[i].active = false
      return 0
    }

    // Raw noise in the chosen colour.
    let w = nextNoise()
    var n: Float
    switch noiseVoices[i].color {
    case 1: // pink (Paul Kellet's economy filter)
      noiseVoices[i].b0 = 0.99765 * noiseVoices[i].b0 + w * 0.0990460
      noiseVoices[i].b1 = 0.96300 * noiseVoices[i].b1 + w * 0.2965164
      noiseVoices[i].b2 = 0.57000 * noiseVoices[i].b2 + w * 1.0526913
      n = (noiseVoices[i].b0 + noiseVoices[i].b1 + noiseVoices[i].b2 + w * 0.1848) * 0.3
    case 2: // brown (leaky-integrated white)
      noiseVoices[i].brown = (noiseVoices[i].brown + 0.02 * w) / 1.02
      n = noiseVoices[i].brown * 3.2
    default: // white
      n = w * 0.6
    }

    var amp: Float = 0
    var fc: Float = 1000
    var tone: Float = 0
    switch noiseVoices[i].shape {
    case 0: // Wave
      if t < pre {
        let s = sinf(t / max(0.001, pre) * Float.pi / 2)
        amp = s * s
      } else {
        let c = cosf(min(1, (t - pre) / max(0.001, post)) * Float.pi / 2)
        amp = c * c
      }
      fc = 300 * powf(24, amp)
    case 1: // Wind
      if t < pre {
        let x = t / max(0.001, pre)
        amp = powf(x, 2.2)
        fc = 250 * powf(56, x)
      } else {
        let y = min(1, (t - pre) / max(0.05, post))
        amp = (1 - y) * (1 - y)
        fc = 14000
      }
    case 2: // Thunder
      amp = (1 - expf(-t / 0.15)) * expf(-t * 3.5 / max(0.5, post)) * (0.75 + 0.25 * sinf(t * 7)) * 2.4
      fc = 110 + 260 * amp
    case 3: // Boom
      noiseVoices[i].phase += (38 + 100 * expf(-t * 22)) * dt
      if noiseVoices[i].phase >= 1 { noiseVoices[i].phase -= 1 }
      tone = sinf(2 * Float.pi * noiseVoices[i].phase) * expf(-t * 5 / max(0.4, post))
      amp = expf(-t * 12) * 0.5
      fc = 220
    default: // Crash
      let attack: Float = t < 0.004 ? t / 0.004 : 1
      amp = expf(-t * 5 / max(0.3, post)) * attack
      fc = 2500 + 11000 * expf(-t * 3 / max(0.3, post))
      noiseVoices[i].hpState += 0.2 * (n - noiseVoices[i].hpState)
      n -= noiseVoices[i].hpState // take out the lows
    }

    // 12 dB/oct low-pass whose cutoff follows the shape.
    let cutoff = min(max(fc, 40), 0.45 * sr)
    let g = tanf(Float.pi * cutoff / sr)
    let k: Float = 1.2
    let a1 = 1 / (1 + g * (g + k))
    let a2 = g * a1
    let a3 = g * a2
    let v3 = n - noiseVoices[i].ic2
    let v1 = a1 * noiseVoices[i].ic1 + a2 * v3
    let v2 = noiseVoices[i].ic2 + a2 * noiseVoices[i].ic1 + a3 * v3
    noiseVoices[i].ic1 = 2 * v1 - noiseVoices[i].ic1
    noiseVoices[i].ic2 = 2 * v2 - noiseVoices[i].ic2
    noiseVoices[i].t = t + dt
    let gain = noiseGains[min(4, max(0, noiseVoices[i].shape)) * 3 + min(2, max(0, noiseVoices[i].color))]
    return (v2 * amp + tone) * noiseVoices[i].level * 0.5 * gain
  }

  /// Work out this part's filter for the coming buffer: the normal CC-driven low-pass, or a preset gliding to
  /// its frequency, or (just after a preset is switched off) gliding back to the CC position before handing over.
  private func prepareFilter(_ p: Int, ccFc: Float, ccRes: Float, bufDur: Float, sr: Float) {
    let wanted = fMode[p]
    var modeEff = wanted
    var hz = ccFc
    var res = ccRes
    let a: Float = fGlide <= 0.02 ? 1 : 1 - expf(-bufDur / (fGlide / 3))
    if wanted != 0 {
      if !fActive[p] {
        fCur[p] = ccFc
        fResCur[p] = ccRes
        fActive[p] = true
      }
      fReturning[p] = false
      let from = max(20, fCur[p])
      let to = max(20, fTarget[p])
      fCur[p] = expf(logf(from) + (logf(to) - logf(from)) * a)
      fResCur[p] += (min(0.92, fRes[p] * 0.95) - fResCur[p]) * a
      hz = fCur[p]
      res = fResCur[p]
    } else {
      if fActive[p] {
        fActive[p] = false
        fReturning[p] = true
      }
      if fReturning[p] {
        let from = max(20, fCur[p])
        let to = max(20, ccFc)
        fCur[p] = expf(logf(from) + (logf(to) - logf(from)) * a)
        fResCur[p] += (ccRes - fResCur[p]) * a
        hz = fCur[p]
        res = fResCur[p]
        modeEff = 1
        if fabsf(logf(max(20, fCur[p]) / to)) < 0.03 { fReturning[p] = false }
      }
    }
    let f = min(max(hz, 20), 0.45 * sr)
    let g = tanf(Float.pi * f / sr)
    let k = 2 - 2 * min(0.92, max(0, res))
    let a1 = 1 / (1 + g * (g + k))
    fcA1[p] = a1
    fcA2[p] = g * a1
    fcA3[p] = g * g * a1
    fcK[p] = k
    fcMode[p] = modeEff
  }

  private func render(frameCount: Int, bufferList: UnsafeMutablePointer<AudioBufferList>) {
    drainEvents()

    let abl = UnsafeMutableAudioBufferListPointer(bufferList)
    let sr = sampleRate
    let dt = 1 / sr
    let on = enabled

    // 12 dB/oct resonant state-variable filter (TPT). Normal: a low-pass, cutoff 60 Hz ... 3.6 kHz exponential
    // in CC 74, resonance from CC 71 (checked offline: ~22 dB swing in the audible band across the CC range).
    // A filter PRESET (setFilterTargets) can give a part a low-pass, high-pass or band-pass at a chosen
    // frequency instead, gliding there; the same filter makes all three.
    let ccFc = min(60 * powf(60, cutoffCC / 127), 0.45 * sr)
    let ccRes = min(0.92, max(0, resonanceCC / 127 * 0.95))
    // Drum bus: a much wider range (150 Hz ... ~18 kHz) so the hats and snare are not dulled when open.
    let drumCcFc = min(150 * powf(120, drumCutoffCC / 127), 0.45 * sr)
    let drumCcRes = min(0.92, max(0, drumResonanceCC / 127 * 0.95))
    let bufDur = Float(frameCount) / sr
    for part in 0..<4 {
      prepareFilter(part, ccFc: part == 3 ? drumCcFc : ccFc, ccRes: part == 3 ? drumCcRes : ccRes, bufDur: bufDur, sr: sr)
    }
    let attack = 1 - expf(-dt / 0.9)
    let release = 1 - expf(-dt / 1.6)
    let expSmooth = 1 - expf(-dt / 0.03)

    for frame in 0..<frameCount {
      // Each part's mono signal, so the effects (UglyFX) can treat the parts separately.
      var partBass: Float = 0
      var partPad: Float = 0
      var partDancer: Float = 0
      var drumSum: Float = 0

      for c in 0..<16 {
        expCurrent[c] += (expTarget[c] - expCurrent[c]) * expSmooth
      }

      for i in 0..<padCount where pads[i].active {
        let f = 440 * powf(2, Float(pads[i].note - 69) / 12)
        pads[i].phaseA += f * 0.998 * dt
        if pads[i].phaseA >= 1 { pads[i].phaseA -= 1 }
        pads[i].phaseB += f * 1.003 * dt
        if pads[i].phaseB >= 1 { pads[i].phaseB -= 1 }
        let saw = (pads[i].phaseA * 2 - 1) + (pads[i].phaseB * 2 - 1)
        let fp = min(2, max(0, partOfChannel[Int(pads[i].channel)]))
        let v3 = saw - pads[i].ic2
        let v1 = fcA1[fp] * pads[i].ic1 + fcA2[fp] * v3
        let v2 = pads[i].ic2 + fcA2[fp] * pads[i].ic1 + fcA3[fp] * v3
        pads[i].ic1 = 2 * v1 - pads[i].ic1
        pads[i].ic2 = 2 * v2 - pads[i].ic2
        let padFiltered: Float = fcMode[fp] == 3 ? v1 * fcK[fp] : (fcMode[fp] == 2 ? saw - fcK[fp] * v1 - v2 : v2)
        if pads[i].gate {
          pads[i].env += (1 - pads[i].env) * attack
        } else {
          pads[i].env -= pads[i].env * release
          if pads[i].env < 0.0005 { pads[i].active = false }
        }
        let padOut = padFiltered * pads[i].env * pads[i].velocity * 0.09 * expCurrent[Int(pads[i].channel)]
        switch partOfChannel[Int(pads[i].channel)] {
        case 0: partBass += padOut
        case 2: partDancer += padOut
        default: partPad += padOut
        }
      }

      for i in 0..<drumCount where drums[i].active {
        let t = drums[i].t
        let D = max(0.2, drums[i].decay)
        let f = drums[i].tuneRatio
        let tone = drums[i].tone
        let snap = drums[i].snap
        let noise = nextNoise()
        var s: Float = 0
        var alive = true
        switch drums[i].kind {
        case 0: // kick: sine sweep, plus a click when snap is above half
          let freq = (45 + 120 * expf(-t * 28)) * f
          drums[i].phase += freq * dt
          if drums[i].phase >= 1 { drums[i].phase -= 1 }
          s = sinf(2 * Float.pi * drums[i].phase) * expf(-t * 7 / D)
          s += noise * max(0, snap - 0.5) * 0.7 * expf(-t * 500)
          alive = t <= 0.5 * D + 0.05
        case 1: // snare: two tones plus band-passed noise
          let body = (sinf(2 * Float.pi * 190 * f * t) * 0.55 + sinf(2 * Float.pi * 330 * f * t) * 0.3) * expf(-t * 26 / D)
          let r = 0.95 - 0.10 * tone
          let hp = noise - drums[i].xPrev + r * drums[i].hpPrev
          drums[i].xPrev = noise
          drums[i].hpPrev = hp
          let a = 0.10 + 0.35 * tone
          drums[i].lp += a * (hp - drums[i].lp)
          drums[i].lp2 += a * (drums[i].lp - drums[i].lp2)
          s = body + drums[i].lp2 * snap * 1.3 * expf(-t * 17 / D)
          alive = t <= 0.35 * D + 0.1
        case 2: // rim click: two short tones and a click
          let tones = (sinf(2 * Float.pi * 1700 * f * t) * 0.5 + sinf(2 * Float.pi * 480 * f * t) * 0.5) * expf(-t * 420 / D)
          s = tones * 0.9 + noise * snap * 0.6 * expf(-t * 1500)
          alive = t <= 0.05 * D + 0.02
        case 3: // clap: three quick noise bursts and a tail
          let r = 0.90 - 0.15 * tone
          let hp = noise - drums[i].xPrev + r * drums[i].hpPrev
          drums[i].xPrev = noise
          drums[i].hpPrev = hp
          let a = 0.08 + 0.30 * tone
          drums[i].lp += a * (hp - drums[i].lp)
          drums[i].lp2 += a * (drums[i].lp - drums[i].lp2)
          var burst: Float = 0
          if t >= 0 { burst += expf(-t * 300) }
          if t >= 0.0105 { burst += expf(-(t - 0.0105) * 300) }
          if t >= 0.0215 { burst += expf(-(t - 0.0215) * 300) }
          let tail: Float = t > 0.03 ? 0.55 * expf(-(t - 0.03) * 35 / D) : 0
          s = drums[i].lp2 * min(1.3, burst + tail) * (0.6 + snap) * 5.2
          alive = t <= 0.4 * D + 0.1
        case 4, 5: // closed and open hat: high-passed noise
          let r = 0.92 - 0.2 * tone
          let hp = noise - drums[i].xPrev + r * drums[i].hpPrev
          drums[i].xPrev = noise
          drums[i].hpPrev = hp
          let hp2 = hp - drums[i].xPrev2 + r * drums[i].hp2Prev
          drums[i].xPrev2 = hp
          drums[i].hp2Prev = hp2
          drums[i].lp += 0.6 * (hp2 - drums[i].lp)
          let rate: Float = drums[i].kind == 4 ? 70 : 11
          s = drums[i].lp * 0.92 * expf(-t * rate / D)
          alive = t <= (drums[i].kind == 4 ? 0.15 : 0.8) * D + 0.05
        case 6: // shaker: soft band-passed noise with a gentle attack
          let r = 0.80 - 0.25 * tone
          let hp = noise - drums[i].xPrev + r * drums[i].hpPrev
          drums[i].xPrev = noise
          drums[i].hpPrev = hp
          let a = 0.18 + 0.35 * tone
          drums[i].lp += a * (hp - drums[i].lp)
          drums[i].lp2 += a * (drums[i].lp - drums[i].lp2)
          let attack = max(0.002, 0.03 - 0.025 * snap)
          let env = (1 - expf(-t / attack)) * expf(-t * 30 / D)
          s = drums[i].lp2 * env * 5.45
          alive = t <= 0.25 * D + 0.05
        case 9: // tambourine: band-limited noise plus ringing jingle partials
          let r = 0.70 - 0.25 * tone
          let hp = noise - drums[i].xPrev + r * drums[i].hpPrev
          drums[i].xPrev = noise
          drums[i].hpPrev = hp
          let a = 0.22 + 0.45 * tone
          drums[i].lp += a * (hp - drums[i].lp)
          var jingle: Float = 0
          jingle += sinf(2 * Float.pi * 3900 * f * t + 3900) * 0.6
          jingle += sinf(2 * Float.pi * 4700 * f * t + 4700) * 1.0
          jingle += sinf(2 * Float.pi * 6100 * f * t + 6100) * 0.8
          jingle += sinf(2 * Float.pi * 7900 * f * t + 7900) * 0.6
          jingle += sinf(2 * Float.pi * 9300 * f * t + 9300) * 0.4
          let attack = max(0.002, 0.012 - 0.01 * snap)
          let env = 1 - expf(-t / attack)
          s = (drums[i].lp * 1.58 * expf(-t * 26 / D) + jingle * 0.158 * expf(-t * 14 / D)) * env
          alive = t <= 0.45 * D + 0.05
        case 13: // jingle tambourine: six ringing jingles that rattle, three quick re-strikes and a soft skin thump (scratchpad jingle.py)
          let jscale = (0.75 + 0.5 * tone) * f
          var ex: Float = 0
          if t >= 0 { ex += expf(-t * 70) }
          if t >= 0.017 { ex += 0.7 * expf(-(t - 0.017) * 70) }
          if t >= 0.038 { ex += 0.45 * expf(-(t - 0.038) * 70) }
          ex += 0.55 * expf(-t * 9 / D) * (1 - expf(-t / 0.004))
          var jg: Float = 0
          jg += sinf(2 * Float.pi * 3150 * jscale * t + 3150) * 0.8 * (0.65 + 0.35 * fabsf(sinf(2 * Float.pi * 11.5 * t + 0.0))) * expf(-t * 6.0 / D)
          jg += sinf(2 * Float.pi * 4020 * jscale * t + 4020) * 1.0 * (0.65 + 0.35 * fabsf(sinf(2 * Float.pi * 14.5 * t + 1.3))) * expf(-t * 7.2 / D)
          jg += sinf(2 * Float.pi * 4870 * jscale * t + 4870) * 0.9 * (0.65 + 0.35 * fabsf(sinf(2 * Float.pi * 9.5 * t + 2.6))) * expf(-t * 8.4 / D)
          jg += sinf(2 * Float.pi * 5930 * jscale * t + 5930) * 0.7 * (0.65 + 0.35 * fabsf(sinf(2 * Float.pi * 16.5 * t + 3.9))) * expf(-t * 9.6 / D)
          jg += sinf(2 * Float.pi * 7140 * jscale * t + 7140) * 0.55 * (0.65 + 0.35 * fabsf(sinf(2 * Float.pi * 13.5 * t + 5.2))) * expf(-t * 10.8 / D)
          jg += sinf(2 * Float.pi * 8600 * jscale * t + 8600) * 0.4 * (0.65 + 0.35 * fabsf(sinf(2 * Float.pi * 18.5 * t + 6.5))) * expf(-t * 12.0 / D)
          let jing = jg * ex * 0.12 * (0.5 + tone)
          let thump = sinf(2 * Float.pi * (150 + 70 * expf(-t * 60)) * f * t) * expf(-t * 38) * 0.40 * (0.4 + snap)
          drums[i].lp += 0.30 * (noise - drums[i].lp)
          drums[i].lp2 += 0.06 * (drums[i].lp - drums[i].lp2)
          let nz = (drums[i].lp - drums[i].lp2) * 0.9 * expf(-t * 22 / D)
          s = (jing + thump + nz) * 0.46
          alive = t <= 0.4 * D + 0.05
        case 7, 10, 11, 12: // toms: a quick pitch drop, membrane overtones, a bright stick attack and a little shell noise (scratchpad tom3.py)
          var b: Float = 105
          var drop: Float = 0.55
          var rate: Float = 32
          var dec: Float = 7.0
          if drums[i].kind == 10 { b = 82; rate = 30; dec = 6.2 }
          if drums[i].kind == 11 { b = 118; rate = 32; dec = 7.5 }
          if drums[i].kind == 12 { b = 168; rate = 34; dec = 9.0 }
          // Phase in closed form (the integral of the falling pitch), NOT wrapped: the overtones are multiples
          // of it, and wrapping it once per cycle would put a click into them every cycle (a buzz).
          let ph = b * f * (t + drop * (1 - expf(-t * rate)) / rate)
          let over = 0.35 + 1.3 * tone // tone brings the overtones up
          var body = sinf(2 * Float.pi * ph) * expf(-t * dec / D)
          body += sinf(2 * Float.pi * 1.59 * ph) * 0.55 * over * expf(-t * dec * 1.7 / D)
          body += sinf(2 * Float.pi * 2.14 * ph) * 0.32 * over * expf(-t * dec * 2.2 / D)
          body += sinf(2 * Float.pi * 2.65 * ph) * 0.18 * over * expf(-t * dec * 2.8 / D)
          body += sinf(2 * Float.pi * 2.92 * ph) * 0.10 * over * expf(-t * dec * 3.4 / D)
          // Stick attack: lightly filtered noise (bright), snap sets its level.
          drums[i].lp += 0.8 * (noise - drums[i].lp)
          let stick = drums[i].lp * snap * 0.5 * expf(-t * 170)
          // Shell noise: a band of noise that rings a little with the head; tone brings it up.
          drums[i].lp2 += 0.35 * (noise - drums[i].lp2)
          drums[i].hpPrev += 0.08 * (drums[i].lp2 - drums[i].hpPrev)
          let shell = (drums[i].lp2 - drums[i].hpPrev) * 0.4 * (0.5 + tone) * expf(-t * 28 / D)
          s = (body * 0.55 + stick + shell) * 0.91
          alive = t <= 0.9 * D + 0.05
        default: // wood block
          s = sinf(2 * Float.pi * 820 * f * t) * expf(-t * 45 / D) * 0.7
          alive = t <= 0.25 * D + 0.02
        }
        if !alive { drums[i].active = false }
        drums[i].t += dt
        drumSum += s * drums[i].velocity * 0.45 * drums[i].level
      }

      let dv3 = drumSum - drumIc2
      let dv1 = fcA1[3] * drumIc1 + fcA2[3] * dv3
      let dv2 = drumIc2 + fcA2[3] * drumIc1 + fcA3[3] * dv3
      drumIc1 = 2 * dv1 - drumIc1
      drumIc2 = 2 * dv2 - drumIc2
      let drumFiltered: Float = fcMode[3] == 3 ? dv1 * fcK[3] : (fcMode[3] == 2 ? drumSum - fcK[3] * dv1 - dv2 : dv2)

      if bassOn, bassChannel >= 0, bassChannel < 16 {
        var bassSample = bass.nextSample() * 0.85 * expCurrent[bassChannel]
        if fcMode[0] != 0 {
          let bv3 = bassSample - bassIc2
          let bv1 = fcA1[0] * bassIc1 + fcA2[0] * bv3
          let bv2 = bassIc2 + fcA2[0] * bassIc1 + fcA3[0] * bv3
          bassIc1 = 2 * bv1 - bassIc1
          bassIc2 = 2 * bv2 - bassIc2
          bassSample = fcMode[0] == 3 ? bv1 * fcK[0] : (fcMode[0] == 2 ? bassSample - fcK[0] * bv1 - bv2 : bv2)
        } else {
          bassIc1 = 0
          bassIc2 = 0
        }
        partBass += bassSample
      }

      // The built-in test sound switch silences the instruments, but NOT the
      // transition noise: you want that even when another app makes the music.
      if !on {
        partBass = 0
        partPad = 0
        partDancer = 0
      }
      let partDrums: Float = on ? drumFiltered : 0
      var noiseOut: Float = 0
      for i in 0..<noiseVoiceCount where noiseVoices[i].active {
        noiseOut += renderNoise(i, dt: dt, sr: sr)
      }
      // The parts go through the effects (stereo out); the transition noise stays dry and centred.
      var left: Float = 0
      var right: Float = 0
      fx.process(partBass, partPad, partDancer, partDrums, left: &left, right: &right)
      // gentle soft clip so stacked voices can't blast
      left = tanhf(left + noiseOut)
      right = tanhf(right + noiseOut)

      var channelIndex = 0
      for buffer in abl {
        let p = buffer.mData!.assumingMemoryBound(to: Float.self)
        p[frame] = channelIndex == 1 ? right : left
        channelIndex += 1
      }
    }
  }
}
