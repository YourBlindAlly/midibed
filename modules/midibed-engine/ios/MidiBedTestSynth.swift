import Foundation
import AVFoundation
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
    var lp: Float = 0
    var age: Int = 0
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
  private let padCount = 8
  private let drumCount = 8
  private var cutoffCC: Float = 70
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
  }

  deinit {
    engine.stop()
    ring.deallocate()
    lock.deallocate()
    pads.deallocate()
    drums.deallocate()
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
    do {
      try engine.start()
    } catch {
      NSLog("MidiBedTestSynth: engine start failed: \(error)")
    }
  }

  /// Restarts the engine after an audio-session interruption (phone call etc.).
  func restartIfNeeded() {
    if !engine.isRunning {
      try? AVAudioSession.sharedInstance().setActive(true)
      try? engine.start()
    }
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

  // MARK: - Audio thread

  private func drainEvents() {
    guard os_unfair_lock_trylock(lock) else { return }
    while readIndex != writeIndex {
      let e = ring[readIndex]
      readIndex = (readIndex + 1) % capacity
      handle(e)
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
      if e.d1 == 74 { cutoffCC = Float(e.d2) }
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
    pads[slot] = PadVoice(active: true, gate: true, note: note, phaseA: 0, phaseB: 0.37, env: 0, velocity: velocity, lp: 0, age: padAgeCounter)
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

  private func render(frameCount: Int, bufferList: UnsafeMutablePointer<AudioBufferList>) {
    drainEvents()

    let abl = UnsafeMutableAudioBufferListPointer(bufferList)
    let sr = sampleRate
    let dt = 1 / sr
    let on = enabled

    // Cutoff 100 Hz ... ~8 kHz, exponential in the CC value.
    let fc = 100 * powf(80, cutoffCC / 127)
    let lpCoef = 1 - expf(-2 * Float.pi * fc / sr)
    let attack = 1 - expf(-dt / 0.9)
    let release = 1 - expf(-dt / 1.6)

    for frame in 0..<frameCount {
      var out: Float = 0

      for i in 0..<padCount where pads[i].active {
        let f = 440 * powf(2, Float(pads[i].note - 69) / 12)
        pads[i].phaseA += f * 0.998 * dt
        if pads[i].phaseA >= 1 { pads[i].phaseA -= 1 }
        pads[i].phaseB += f * 1.003 * dt
        if pads[i].phaseB >= 1 { pads[i].phaseB -= 1 }
        let saw = (pads[i].phaseA * 2 - 1) + (pads[i].phaseB * 2 - 1)
        pads[i].lp += lpCoef * (saw - pads[i].lp)
        if pads[i].gate {
          pads[i].env += (1 - pads[i].env) * attack
        } else {
          pads[i].env -= pads[i].env * release
          if pads[i].env < 0.0005 { pads[i].active = false }
        }
        out += pads[i].lp * pads[i].env * pads[i].velocity * 0.12
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
        out += s * drums[i].velocity * 0.45
      }

      if !on { out = 0 }
      // gentle soft clip so stacked voices can't blast
      out = tanhf(out)

      for buffer in abl {
        let p = buffer.mData!.assumingMemoryBound(to: Float.self)
        p[frame] = out
      }
    }
  }
}
