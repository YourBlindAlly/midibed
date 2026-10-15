import Foundation

// "Ugly FX": the built-in sound's effects. Plain on purpose: a stereo chorus per part, a pan per part, and
// two shared effects (a reverb and a ping-pong delay) that every part feeds with its own send level.
// SELF-CONTAINED (imports only Foundation, nothing from MidiBed) so it can be lifted into a plug-in later.
// Designed and level-checked offline in the scratchpad (fx_check.py): the reverb is the classic Freeverb
// layout (8 combs + 4 all-passes per side, right side offset 23 samples for width), stable at every setting,
// decays in ~0.7 s (size 0) to several seconds (size 1).

/// Indices into `UglyFX.params`. ONE case per line: a jest test reads this block and compares it with
/// `UGLY_FX_PARAMS` in src/uglyfx.ts (KEEP THEM IN STEP).
enum UglyFXParam: Int {
  case bassPan = 0      // -1 (left) ... 1 (right)
  case bassReverb       // 0...1 send
  case bassDelay        // 0...1 send
  case bassChorus       // 0...1
  case padPan
  case padReverb
  case padDelay
  case padChorus
  case dancerPan
  case dancerReverb
  case dancerDelay
  case dancerChorus
  case drumsPan
  case drumsReverb
  case drumsDelay
  case drumsChorus
  case reverbSize       // 0...1
  case reverbDamp       // 0...1, more = darker tail
  case delayMs          // 60...1500
  case delayFeedback    // 0...0.8
  case loopsPan         // the loop player (stereo in): balance -1...1
  case loopsReverb
  case loopsDelay
  case loopsChorus      // reserved: the loops are not chorused yet
  static let count = 24
}

private final class FXLine {
  let size: Int
  let buf: UnsafeMutablePointer<Float>
  var idx = 0
  init(_ n: Int) {
    size = max(8, n)
    buf = UnsafeMutablePointer<Float>.allocate(capacity: size)
    buf.initialize(repeating: 0, count: size)
  }
  deinit { buf.deallocate() }
}

private final class FXReverbSide {
  let combs: [FXLine]
  var filt = [Float](repeating: 0, count: 8)
  let allpass: [FXLine]
  init(sampleRate: Float, spread: Int) {
    let k = sampleRate / 44100
    let ct = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
    let at = [556, 441, 341, 225]
    combs = ct.map { FXLine(Int(Float($0 + spread) * k)) }
    allpass = at.map { FXLine(Int(Float($0 + spread) * k)) }
  }
  @inline(__always) func step(_ x: Float, feedback: Float, damp: Float) -> Float {
    var s: Float = 0
    for j in 0..<8 {
      let c = combs[j]
      let o = c.buf[c.idx]
      filt[j] = o * (1 - damp) + filt[j] * damp
      c.buf[c.idx] = x + filt[j] * feedback
      c.idx += 1
      if c.idx >= c.size { c.idx = 0 }
      s += o
    }
    for j in 0..<4 {
      let a = allpass[j]
      let b = a.buf[a.idx]
      let o = -s + b
      a.buf[a.idx] = s + b * 0.5
      a.idx += 1
      if a.idx >= a.size { a.idx = 0 }
      s = o
    }
    return s
  }
}

final class UglyFX {
  /// Settings, written from the control side and read on the audio thread (a stale value for one buffer is
  /// harmless, so no lock).
  let params: UnsafeMutablePointer<Float>

  private var sr: Float = 44100
  private var revL: FXReverbSide
  private var revR: FXReverbSide
  private var chorusLines: [FXLine]
  private var chorusPhase = [Float](repeating: 0, count: 4)
  private var delayL: FXLine
  private var delayR: FXLine
  private var delayLen: Float = 22050 // smoothed delay time in samples
  private var delayDampL: Float = 0
  private var delayDampR: Float = 0

  init() {
    let ptr = UnsafeMutablePointer<Float>.allocate(capacity: UglyFXParam.count)
    ptr.initialize(repeating: 0, count: UglyFXParam.count)
    ptr[UglyFXParam.reverbSize.rawValue] = 0.55
    ptr[UglyFXParam.reverbDamp.rawValue] = 0.5
    ptr[UglyFXParam.delayMs.rawValue] = 375
    ptr[UglyFXParam.delayFeedback.rawValue] = 0.3
    params = ptr
    revL = FXReverbSide(sampleRate: 44100, spread: 0)
    revR = FXReverbSide(sampleRate: 44100, spread: 23)
    chorusLines = (0..<4).map { _ in FXLine(2048) }
    delayL = FXLine(Int(44100 * 1.6) + 4)
    delayR = FXLine(Int(44100 * 1.6) + 4)
  }

  deinit { params.deallocate() }

  /// Call before audio starts (and again if the sample rate changes): sizes the delay lines for it.
  func setSampleRate(_ rate: Float) {
    sr = rate
    revL = FXReverbSide(sampleRate: rate, spread: 0)
    revR = FXReverbSide(sampleRate: rate, spread: 23)
    chorusLines = (0..<4).map { _ in FXLine(Int(rate * 0.05) + 8) }
    delayL = FXLine(Int(rate * 1.6) + 4)
    delayR = FXLine(Int(rate * 1.6) + 4)
    delayLen = max(1, params[UglyFXParam.delayMs.rawValue] * 0.001 * rate)
  }

  /// One frame: the four parts' mono signals in (bass, pad, dancer, drums) and the loop player's stereo pair,
  /// stereo out.
  @inline(__always)
  func process(_ b0: Float, _ b1: Float, _ b2: Float, _ b3: Float, loopL: Float, loopR: Float, left: inout Float, right: inout Float) {
    let p = params
    var outL: Float = 0
    var outR: Float = 0
    var revIn: Float = 0
    var delIn: Float = 0
    let invSr = 1 / sr

    for i in 0..<4 {
      let x = i == 0 ? b0 : (i == 1 ? b1 : (i == 2 ? b2 : b3))
      let base = i * 4
      let pan = max(-1, min(1, p[base]))
      let rev = max(0, min(1, p[base + 1]))
      let del = max(0, min(1, p[base + 2]))
      let cho = max(0, min(1, p[base + 3]))

      // Chorus: two taps around 12 and 15 ms, moved slowly by a sine each, so left and right differ.
      let line = chorusLines[i]
      line.buf[line.idx] = x
      chorusPhase[i] += 0.33 * invSr
      if chorusPhase[i] >= 1 { chorusPhase[i] -= 1 }
      let ph = chorusPhase[i] * 2 * Float.pi
      let dl = (0.012 + 0.0028 * sinf(ph)) * sr
      let dr = (0.015 + 0.0028 * sinf(ph + 2.1)) * sr
      let tl = tap(line, dl)
      let tr = tap(line, dr)
      line.idx += 1
      if line.idx >= line.size { line.idx = 0 }
      var l = x * (1 - 0.45 * cho) + tl * 0.75 * cho
      var r = x * (1 - 0.45 * cho) + tr * 0.75 * cho

      let s = (l + r) * 0.5
      revIn += s * rev
      delIn += s * del

      // Balance: the quieter side is turned down, the other stays where it is.
      if pan > 0 { l *= 1 - pan } else if pan < 0 { r *= 1 + pan }
      outL += l
      outR += r
    }

    // The loop player: stereo, balance, and sends into the shared reverb and delay.
    let loopPan = max(-1, min(1, p[UglyFXParam.loopsPan.rawValue]))
    outL += loopL * (loopPan > 0 ? 1 - loopPan : 1)
    outR += loopR * (loopPan < 0 ? 1 + loopPan : 1)
    let loopMono = (loopL + loopR) * 0.5
    revIn += loopMono * max(0, min(1, p[UglyFXParam.loopsReverb.rawValue]))
    delIn += loopMono * max(0, min(1, p[UglyFXParam.loopsDelay.rawValue]))

    // Reverb return.
    let size = max(0, min(1, p[UglyFXParam.reverbSize.rawValue]))
    let damp = 0.05 + 0.35 * max(0, min(1, p[UglyFXParam.reverbDamp.rawValue]))
    let fb = 0.72 + 0.24 * size
    let rin = revIn * 0.03
    outL += revL.step(rin, feedback: fb, damp: damp)
    outR += revR.step(rin, feedback: fb, damp: damp)

    // Ping-pong delay return: the input goes in on the left, each repeat crosses to the other side.
    let targetLen = max(1, min(sr * 1.5, p[UglyFXParam.delayMs.rawValue] * 0.001 * sr))
    delayLen += (targetLen - delayLen) * 0.0005
    let fbk = max(0, min(0.8, p[UglyFXParam.delayFeedback.rawValue]))
    let wl = tap(delayL, delayLen)
    let wr = tap(delayR, delayLen)
    delayDampL += 0.45 * (wl - delayDampL)
    delayDampR += 0.45 * (wr - delayDampR)
    delayL.buf[delayL.idx] = delIn + delayDampR * fbk
    delayR.buf[delayR.idx] = delayDampL * fbk
    delayL.idx += 1
    if delayL.idx >= delayL.size { delayL.idx = 0 }
    delayR.idx += 1
    if delayR.idx >= delayR.size { delayR.idx = 0 }
    outL += wl * 0.8
    outR += wr * 0.8

    left = outL
    right = outR
  }

  /// Read `delay` samples behind the write position, with linear interpolation.
  @inline(__always)
  private func tap(_ line: FXLine, _ delay: Float) -> Float {
    let d = max(1, min(Float(line.size - 2), delay))
    let whole = Int(d)
    let frac = d - Float(whole)
    var i0 = line.idx - whole
    if i0 < 0 { i0 += line.size }
    var i1 = i0 - 1
    if i1 < 0 { i1 += line.size }
    return line.buf[i0] * (1 - frac) + line.buf[i1] * frac
  }
}
