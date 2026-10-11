import Foundation

/// A monophonic bass voice in the style of the Moog Taurus and Cherry Audio Lowdown: two oscillators
/// plus a sub, a 4-pole (24 dB/oct) ladder filter with resonance and drive, filter and amplitude
/// envelopes, glide, an LFO and a "weight" control for the low end.
///
/// SELF-CONTAINED ON PURPOSE: this file imports only Foundation and knows nothing about MidiBed, CoreMIDI,
/// AVFoundation or UIKit, so it can be lifted into another app or an AUv3 extension as it is. Feed it
/// notes (`noteOn` / `noteOff`), controller values, and pull samples with `nextSample()`. All methods
/// except writing into `params` belong on the audio thread; `params` is a plain float array the control
/// side may write at any time (a stale read for a moment is harmless).
///
/// The reference model for the numbers in here is `scratchpad/bass_check.py` (numpy), which was used to
/// check stability, level and envelope timing before the first build.

/// Indices into `BassVoice.params`. Units are in the comments (what the DSP uses, not what the UI shows).
enum BassParam: Int {
  case waveA = 0       // 0 saw, 1 pulse, 2 triangle
  case waveB           // same
  case octaveB         // oscillator 2 octave offset, -2...1
  case detuneB         // oscillator 2 detune, cents
  case mixB            // 0...1, balance between oscillator 1 and 2
  case sub             // 0...1, sine one octave below oscillator 1
  case pulseWidth      // 0.05...0.95
  case cutoff          // 0...1, base cutoff: 30 Hz ... ~7.7 kHz (8 octaves)
  case resonance       // 0...1
  case drive           // 0...1, saturation into the filter
  case keyTrack        // 0...1, cutoff follows pitch
  case filterEnv       // 0...1, envelope depth (up to +5 octaves)
  case fAttack         // seconds
  case fDecay
  case fSustain        // 0...1
  case fRelease
  case aAttack
  case aDecay
  case aSustain
  case aRelease
  case glide           // seconds, 0 = off
  case legato          // 0 or 1: overlapping notes glide instead of retriggering
  case lfoRate         // Hz
  case lfoFilter       // 0...1, depth (up to +-2 octaves of cutoff)
  case lfoPitch        // cents
  case velocity        // 0...1, how much velocity matters
  case weight          // 0...1, low-end boost
  case level           // 0...1

  static let count = 28

  /// A mild Taurus-like starting point: saw + pulse, a little detune, sub, closed-ish filter that opens a
  /// touch on each note.
  static let defaults: [Float] = [
    0, 1, 0, 7, 0.5, 0.5, 0.5,
    0.35, 0.25, 0.3, 0.3, 0.35,
    0.005, 0.35, 0.2, 0.4,
    0.01, 0.2, 0.9, 0.5,
    0, 1, 2, 0, 0, 0.5, 0.3, 0.7,
  ]
}

final class BassVoice {
  private(set) var sampleRate: Float
  /// Written by the control side. `BassParam.count` floats.
  let params: UnsafeMutablePointer<Float>

  /// Controllers (MIDI 0...127): CC 74 moves the cutoff by up to +-3 octaves around its knob, CC 71 adds up
  /// to +-0.25 of resonance. 64 is neutral, so a synth that never receives them sounds as set.
  var cutoffCC: Float = 64
  var resonanceCC: Float = 64

  // Stages: 0 idle, 1 attack, 2 decay, 3 sustain, 4 release
  private var ampStage = 0
  private var ampEnv: Float = 0
  private var fStage = 0
  private var fEnv: Float = 0

  private var phA: Float = 0
  private var phB: Float = 0
  private var phS: Float = 0
  private var lfoPhase: Float = 0

  private var curNote: Float = 36
  private var targetNote: Float = 36
  private var velocity: Float = 1

  private let stackCapacity = 8
  private var stack: UnsafeMutablePointer<Int>
  private var stackCount = 0

  private var y1: Float = 0
  private var y2: Float = 0
  private var y3: Float = 0
  private var y4: Float = 0
  private var lowShelf: Float = 0
  private var dcX: Float = 0
  private var dcY: Float = 0

  private var coefTick = 0
  private var aAttackC: Float = 0
  private var aDecayC: Float = 0
  private var aReleaseC: Float = 0
  private var fAttackC: Float = 0
  private var fDecayC: Float = 0
  private var fReleaseC: Float = 0

  init(sampleRate: Float = 44100) {
    self.sampleRate = sampleRate
    params = UnsafeMutablePointer<Float>.allocate(capacity: BassParam.count)
    for i in 0..<BassParam.count { params[i] = BassParam.defaults[i] }
    stack = UnsafeMutablePointer<Int>.allocate(capacity: stackCapacity)
    stack.initialize(repeating: 0, count: stackCapacity)
    updateCoefficients()
  }

  deinit {
    params.deallocate()
    stack.deallocate()
  }

  func setSampleRate(_ rate: Float) {
    sampleRate = max(8000, rate)
    updateCoefficients()
  }

  @inline(__always) private func p(_ k: BassParam) -> Float { params[k.rawValue] }

  /// A one-pole coefficient that reaches ~98% of its target in `seconds`.
  @inline(__always) private func coef(_ seconds: Float) -> Float {
    1 - expf(-4 / (max(0.001, seconds) * sampleRate))
  }

  private func updateCoefficients() {
    aAttackC = coef(p(.aAttack))
    aDecayC = coef(p(.aDecay))
    aReleaseC = coef(p(.aRelease))
    fAttackC = coef(p(.fAttack))
    fDecayC = coef(p(.fDecay))
    fReleaseC = coef(p(.fRelease))
  }

  var isActive: Bool { ampStage != 0 }

  // MARK: Notes

  func noteOn(note: Int, velocity vel: Float) {
    // Put the note on top of the stack (once).
    removeFromStack(note)
    let wasHeld = stackCount > 0
    if stackCount < stackCapacity {
      stack[stackCount] = note
      stackCount += 1
    }
    targetNote = Float(note)
    velocity = max(0, min(1, vel))
    let retrigger = !wasHeld || p(.legato) < 0.5 || ampStage == 0
    if ampStage == 0 || p(.glide) <= 0.0005 { curNote = targetNote }
    if retrigger {
      ampStage = 1
      fStage = 1
    }
  }

  func noteOff(note: Int) {
    removeFromStack(note)
    if stackCount == 0 {
      if ampStage != 0 {
        ampStage = 4
        fStage = 4
      }
    } else {
      // Still holding another note: go back to it, without retriggering.
      targetNote = Float(stack[stackCount - 1])
      if p(.glide) <= 0.0005 { curNote = targetNote }
    }
  }

  func allNotesOff() {
    stackCount = 0
    if ampStage != 0 {
      ampStage = 4
      fStage = 4
    }
  }

  private func removeFromStack(_ note: Int) {
    var w = 0
    for r in 0..<stackCount where stack[r] != note {
      stack[w] = stack[r]
      w += 1
    }
    stackCount = w
  }

  // MARK: Rendering

  @inline(__always) private func polyBlep(_ t: Float, _ dt: Float) -> Float {
    if t < dt {
      let x = t / dt
      return x + x - x * x - 1
    } else if t > 1 - dt {
      let x = (t - 1) / dt
      return x * x + x + x + 1
    }
    return 0
  }

  @inline(__always) private func oscillator(wave: Int, phase: Float, dt: Float, width: Float) -> Float {
    switch wave {
    case 1:
      var v: Float = phase < width ? 1 : -1
      v += polyBlep(phase, dt)
      var t2 = phase + 1 - width
      if t2 >= 1 { t2 -= 1 }
      v -= polyBlep(t2, dt)
      return v
    case 2:
      return 2 * abs(2 * phase - 1) - 1
    default:
      return 2 * phase - 1 - polyBlep(phase, dt)
    }
  }

  private func stepEnvelope(_ stage: inout Int, _ env: inout Float, attackC: Float, decayC: Float, sustain: Float, releaseC: Float) {
    switch stage {
    case 1:
      env += (1.15 - env) * attackC
      if env >= 1 {
        env = 1
        stage = 2
      }
    case 2:
      env += (sustain - env) * decayC
      if abs(env - sustain) < 0.001 {
        env = sustain
        stage = 3
      }
    case 3:
      env = sustain
    case 4:
      env -= env * releaseC
      if env < 0.0004 {
        env = 0
        stage = 0
      }
    default:
      break
    }
  }

  /// One output sample, roughly -1...1 (the caller applies the channel volume and a soft clip).
  func nextSample() -> Float {
    if ampStage == 0 { return 0 }
    let sr = sampleRate

    coefTick += 1
    if coefTick >= 16 {
      coefTick = 0
      updateCoefficients()
    }

    // LFO and glide (exponential, in semitones)
    lfoPhase += p(.lfoRate) / sr
    if lfoPhase >= 1 { lfoPhase -= 1 }
    let lfo = sinf(2 * Float.pi * lfoPhase)
    let glideTime = p(.glide)
    if glideTime > 0.0005 {
      curNote += (targetNote - curNote) * coef(glideTime)
    } else {
      curNote = targetNote
    }
    let semis = curNote + lfo * p(.lfoPitch) / 100
    let f = 440 * exp2f((semis - 69) / 12)

    // Oscillators
    let dtA = min(0.45, f / sr)
    phA += dtA
    if phA >= 1 { phA -= 1 }
    let fB = f * exp2f(p(.octaveB) + p(.detuneB) / 1200)
    let dtB = min(0.45, fB / sr)
    phB += dtB
    if phB >= 1 { phB -= 1 }
    phS += dtA * 0.5
    if phS >= 1 { phS -= 1 }
    let width = max(0.05, min(0.95, p(.pulseWidth)))
    let oscA = oscillator(wave: Int(p(.waveA)), phase: phA, dt: dtA, width: width)
    let oscB = oscillator(wave: Int(p(.waveB)), phase: phB, dt: dtB, width: width)
    let mix = p(.mixB)
    var x = (oscA * (1 - mix) + oscB * mix) * 0.6 + sinf(2 * Float.pi * phS) * p(.sub) * 0.6

    // Envelopes
    stepEnvelope(&fStage, &fEnv, attackC: fAttackC, decayC: fDecayC, sustain: p(.fSustain), releaseC: fReleaseC)
    stepEnvelope(&ampStage, &ampEnv, attackC: aAttackC, decayC: aDecayC, sustain: p(.aSustain), releaseC: aReleaseC)
    let vs = p(.velocity)
    let velGain = (1 - vs) + vs * velocity

    // Filter: cutoff in octaves above 30 Hz
    var octaves = p(.cutoff) * 8
    octaves += fEnv * velGain * p(.filterEnv) * 5
    octaves += p(.keyTrack) * (curNote - 36) / 12
    octaves += (cutoffCC - 64) / 64 * 3
    octaves += lfo * p(.lfoFilter) * 2
    let fc = min(max(30 * exp2f(octaves), 20), 0.42 * sr)
    let g = 1 - expf(-2 * Float.pi * fc / sr)
    let res = max(0, min(1, p(.resonance) + (resonanceCC - 64) / 127 * 0.5))
    let k = res * 3.9
    x *= (1 + p(.drive) * 5) * (1 + 0.5 * k) * 0.5
    let u = tanhf(x - k * y4)
    y1 += g * (u - y1)
    y2 += g * (y1 - y2)
    y3 += g * (y2 - y3)
    y4 += g * (y3 - y4)

    // Weight: a low shelf made from a low-passed copy
    let gw = 1 - expf(-2 * Float.pi * 120 / sr)
    lowShelf += gw * (y4 - lowShelf)
    var out = y4 + p(.weight) * 1.2 * lowShelf

    out *= ampEnv * velGain * p(.level) * 0.9

    // Remove DC (very low corner, so the sub is untouched)
    let dc = out - dcX + 0.9995 * dcY
    dcX = out
    dcY = dc

    if !dc.isFinite {
      y1 = 0; y2 = 0; y3 = 0; y4 = 0; lowShelf = 0; dcX = 0; dcY = 0
      return 0
    }
    return dc
  }
}
