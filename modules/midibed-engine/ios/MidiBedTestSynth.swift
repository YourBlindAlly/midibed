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

  private struct DrumVoice {
    var active = false
    var kind: Int = 0   // 0 kick, 1 snare, 2 closed hat, 3 open hat, 4 perc
    var t: Float = 0    // seconds since trigger
    var velocity: Float = 0
    var phase: Float = 0
    var hpPrev: Float = 0
    var xPrev: Float = 0
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

  init() {
    lock = UnsafeMutablePointer<os_unfair_lock_s>.allocate(capacity: 1)
    lock.initialize(to: os_unfair_lock_s())
    ring = UnsafeMutablePointer<Event>.allocate(capacity: capacity)
    ring.initialize(repeating: Event(), count: capacity)
    pads = UnsafeMutablePointer<PadVoice>.allocate(capacity: padCount)
    pads.initialize(repeating: PadVoice(), count: padCount)
    drums = UnsafeMutablePointer<DrumVoice>.allocate(capacity: drumCount)
    drums.initialize(repeating: DrumVoice(), count: drumCount)
    expTarget = UnsafeMutablePointer<Float>.allocate(capacity: 16)
    expTarget.initialize(repeating: 1, count: 16)
    expCurrent = UnsafeMutablePointer<Float>.allocate(capacity: 16)
    expCurrent.initialize(repeating: 1, count: 16)
    noiseRing = UnsafeMutablePointer<NoiseCommand>.allocate(capacity: noiseCapacity)
    noiseRing.initialize(repeating: NoiseCommand(), count: noiseCapacity)
    noiseVoices = UnsafeMutablePointer<NoiseVoice>.allocate(capacity: noiseVoiceCount)
    noiseVoices.initialize(repeating: NoiseVoice(), count: noiseVoiceCount)
  }

  deinit {
    engine.stop()
    ring.deallocate()
    lock.deallocate()
    pads.deallocate()
    drums.deallocate()
    expTarget.deallocate()
    expCurrent.deallocate()
    noiseRing.deallocate()
    noiseVoices.deallocate()
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
    switch type {
    case 0x90 where e.d2 > 0:
      noteOn(channel: channel, note: Int(e.d1), velocity: Float(e.d2) / 127)
    case 0x80, 0x90:
      noteOff(channel: channel, note: Int(e.d1))
    case 0xB0:
      if e.d1 == 74 {
        if channel == 9 { drumCutoffCC = Float(e.d2) } else { cutoffCC = Float(e.d2) }
      }
      if e.d1 == 71 {
        if channel == 9 { drumResonanceCC = Float(e.d2) } else { resonanceCC = Float(e.d2) }
      }
      if e.d1 == 7 || e.d1 == 11 { expTarget[Int(channel)] = Float(e.d2) / 127 }
      if e.d1 == 123 || e.d1 == 120 { allNotesOff() }
    default:
      break
    }
  }

  private func noteOn(channel: UInt8, note: Int, velocity: Float) {
    if channel == 9 {
      let kind: Int
      switch note {
      case 35, 36: kind = 0
      case 38, 40: kind = 1
      case 42, 44: kind = 2
      case 46: kind = 3
      default: kind = 4
      }
      // Reuse a free voice, else steal the first one.
      var slot = 0
      for i in 0..<drumCount where !drums[i].active { slot = i; break }
      drums[slot] = DrumVoice(active: true, kind: kind, t: 0, velocity: velocity, phase: 0, hpPrev: 0, xPrev: 0)
      return
    }
    padAgeCounter += 1
    var slot = -1
    for i in 0..<padCount where !pads[i].active { slot = i; break }
    if slot < 0 {
      var oldest = 0
      for i in 0..<padCount where pads[i].age < pads[oldest].age { oldest = i }
      slot = oldest
    }
    pads[slot] = PadVoice(active: true, gate: true, note: note, phaseA: 0, phaseB: 0.37, env: 0, velocity: velocity, ic1: 0, ic2: 0, age: padAgeCounter, channel: channel)
  }

  private func noteOff(channel: UInt8, note: Int) {
    if channel == 9 { return }
    for i in 0..<padCount where pads[i].active && pads[i].gate && pads[i].note == note {
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

  private func render(frameCount: Int, bufferList: UnsafeMutablePointer<AudioBufferList>) {
    drainEvents()

    let abl = UnsafeMutableAudioBufferListPointer(bufferList)
    let sr = sampleRate
    let dt = 1 / sr
    let on = enabled

    // 12 dB/oct resonant lowpass (TPT state-variable). Cutoff 60 Hz ... 3.6 kHz,
    // exponential in CC 74; resonance from CC 71. Chosen so a sweep is clearly
    // audible on a drone that sits low (checked offline: ~22 dB swing in the
    // audible band across the CC range, versus ~8 dB for the old one-pole).
    let fc = min(60 * powf(60, cutoffCC / 127), 0.45 * sr)
    let res = min(0.92, max(0, resonanceCC / 127 * 0.95))
    let g = tanf(Float.pi * fc / sr)
    let k = 2 - 2 * res
    let a1 = 1 / (1 + g * (g + k))
    let a2 = g * a1
    let a3 = g * a2
    let attack = 1 - expf(-dt / 0.9)
    let release = 1 - expf(-dt / 1.6)
    let expSmooth = 1 - expf(-dt / 0.03)

    // Drum bus: same filter type, but a much wider range (150 Hz ... ~18 kHz) so
    // the hats and snare are not dulled at the default fully-open setting.
    let dfc = min(150 * powf(120, drumCutoffCC / 127), 0.45 * sr)
    let dres = min(0.92, max(0, drumResonanceCC / 127 * 0.95))
    let dg = tanf(Float.pi * dfc / sr)
    let dk = 2 - 2 * dres
    let da1 = 1 / (1 + dg * (dg + dk))
    let da2 = dg * da1
    let da3 = dg * da2

    for frame in 0..<frameCount {
      var out: Float = 0
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
        let v3 = saw - pads[i].ic2
        let v1 = a1 * pads[i].ic1 + a2 * v3
        let v2 = pads[i].ic2 + a2 * pads[i].ic1 + a3 * v3
        pads[i].ic1 = 2 * v1 - pads[i].ic1
        pads[i].ic2 = 2 * v2 - pads[i].ic2
        if pads[i].gate {
          pads[i].env += (1 - pads[i].env) * attack
        } else {
          pads[i].env -= pads[i].env * release
          if pads[i].env < 0.0005 { pads[i].active = false }
        }
        out += v2 * pads[i].env * pads[i].velocity * 0.09 * expCurrent[Int(pads[i].channel)]
      }

      for i in 0..<drumCount where drums[i].active {
        let t = drums[i].t
        var s: Float = 0
        switch drums[i].kind {
        case 0:
          let freq = 45 + 120 * expf(-t * 28)
          drums[i].phase += freq * dt
          if drums[i].phase >= 1 { drums[i].phase -= 1 }
          s = sinf(2 * Float.pi * drums[i].phase) * expf(-t * 7)
          if t > 0.5 { drums[i].active = false }
        case 1:
          let tone = sinf(2 * Float.pi * 190 * t) * expf(-t * 26)
          s = (nextNoise() * 0.7 * expf(-t * 17)) + tone * 0.5
          if t > 0.4 { drums[i].active = false }
        case 2, 3:
          let n = nextNoise()
          // crude one-pole highpass
          let hp = n - drums[i].xPrev + 0.93 * drums[i].hpPrev
          drums[i].xPrev = n
          drums[i].hpPrev = hp
          let decay: Float = drums[i].kind == 2 ? 70 : 11
          s = hp * 0.5 * expf(-t * decay)
          if t > (drums[i].kind == 2 ? 0.15 : 0.8) { drums[i].active = false }
        default:
          s = sinf(2 * Float.pi * 820 * t) * expf(-t * 45) * 0.7
          if t > 0.25 { drums[i].active = false }
        }
        drums[i].t += dt
        drumSum += s * drums[i].velocity * 0.45
      }

      let dv3 = drumSum - drumIc2
      let dv1 = da1 * drumIc1 + da2 * dv3
      let dv2 = drumIc2 + da2 * drumIc1 + da3 * dv3
      drumIc1 = 2 * dv1 - drumIc1
      drumIc2 = 2 * dv2 - drumIc2
      out += dv2

      // The built-in test sound switch silences the instruments, but NOT the
      // transition noise: you want that even when another app makes the music.
      if !on { out = 0 }
      var noiseOut: Float = 0
      for i in 0..<noiseVoiceCount where noiseVoices[i].active {
        noiseOut += renderNoise(i, dt: dt, sr: sr)
      }
      // gentle soft clip so stacked voices can't blast
      out = tanhf(out + noiseOut)

      for buffer in abl {
        let p = buffer.mData!.assumingMemoryBound(to: Float.self)
        p[frame] = out
      }
    }
  }
}
