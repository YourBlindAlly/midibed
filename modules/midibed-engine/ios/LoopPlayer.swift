import AVFoundation
import Foundation

/// Four lanes of audio loops for the built-in sound ("Loop player").
///
/// A lane holds one decoded audio file (any format AVAudioFile reads: WAV, AIFF, CAF, MP3, M4A, FLAC). The
/// engine starts a lane on a bar line and restarts it every `bars` bars, and tells it how long those bars
/// last in seconds. Each lane has a pitch ratio P: the pitch the loop plays at relative to the file, which is
/// (the tempo's speed change, if the pitch follows the tempo) times (the lane's semitone shift). When P is the
/// plain speed change that fills the bars, the file just plays faster or slower. Otherwise a copy of the file is
/// made once, in the background, with the right length for P (circular WSOLA, see `stretch`), and that copy is
/// played at speed P, so the loop still fills its bars exactly. The copy lives in memory only, one per lane.
/// Because the engine restarts the loop on a bar line every time round, the audio clock can never drift away
/// from the bed.
///
/// Thread safety: the control side (engine queue, loader queue) and the audio thread share one
/// os_unfair_lock. The audio thread only ever try-locks (one buffer of loops is skipped if the lock is busy).
final class LoopPlayer {
  static let laneCount = 4

  private final class Buf {
    let frames: Int
    let rate: Double
    let l: UnsafeMutablePointer<Float>
    let r: UnsafeMutablePointer<Float>
    init(frames: Int, rate: Double) {
      self.frames = frames
      self.rate = rate
      l = UnsafeMutablePointer<Float>.allocate(capacity: max(1, frames))
      r = UnsafeMutablePointer<Float>.allocate(capacity: max(1, frames))
    }
    deinit {
      l.deallocate()
      r.deallocate()
    }
  }

  private struct Lane {
    var raw: Buf?               // the file as decoded
    var stretched: Buf?         // a copy stretched to `stretchedFrames` frames
    var stretchedFrames = 0
    var failedFrames = 0        // a length the stretch could not be made for (file too short): play `raw`
    var pendingFrames = 0       // a stretch job for this length is running
    var wantFrames = 0          // the length (at the file's rate) one pass of the loop should have
    var follow = true           // the pitch follows the tempo (a plain speed change)
    var semis = 0               // pitch shift in whole semitones
    var path = ""
    var playing = false
    var pos: Double = 0         // in frames of the buffer being played
    var posFrames = 0           // the length of that buffer
    var wantSeconds: Double = 0 // how long one pass of the lane's bars lasts at the current tempo
    var wantRepeats = 1
    var gain: Float = 0         // smoothed
    var target: Float = 0
    var level: Float = 1
    var pan: Float = 0
    var fadeSec: Float = 0.01
    // Scheduled commands (engine-clock times): a start (the loop begins again from the top) and a stop (fade out).
    var startPending = false
    var startAt: Double = 0
    var stopPending = false
    var stopAt: Double = 0
    var stopFade: Float = 0.03
  }

  private var lanes = [Lane](repeating: Lane(), count: LoopPlayer.laneCount)
  private let lock: UnsafeMutablePointer<os_unfair_lock_s>
  private var sampleRate: Float = 44100
  private let blockCapacity = 8192
  private let outL: UnsafeMutablePointer<Float>
  private let outR: UnsafeMutablePointer<Float>
  private let loader = DispatchQueue(label: "midibed.loops.decode", qos: .userInitiated)

  /// Called (on the loader queue) when a lane's file has finished decoding or stretching.
  var onLoaded: ((Int) -> Void)?

  init() {
    lock = UnsafeMutablePointer<os_unfair_lock_s>.allocate(capacity: 1)
    lock.initialize(to: os_unfair_lock_s())
    outL = UnsafeMutablePointer<Float>.allocate(capacity: blockCapacity)
    outR = UnsafeMutablePointer<Float>.allocate(capacity: blockCapacity)
    outL.initialize(repeating: 0, count: blockCapacity)
    outR.initialize(repeating: 0, count: blockCapacity)
  }

  deinit {
    lock.deallocate()
    outL.deallocate()
    outR.deallocate()
  }

  func setSampleRate(_ rate: Float) {
    os_unfair_lock_lock(lock)
    sampleRate = max(8000, rate)
    os_unfair_lock_unlock(lock)
  }

  // MARK: Control side

  /// Make sure `lane` holds this file (decoding it in the background if it is a new one). An empty path
  /// empties the lane. Changing the file stops the lane at once.
  func load(lane: Int, path: String) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    let same = lanes[lane].path == path
    if !same {
      lanes[lane].path = path
      lanes[lane].raw = nil
      lanes[lane].stretched = nil
      lanes[lane].stretchedFrames = 0
      lanes[lane].failedFrames = 0
      lanes[lane].pendingFrames = 0
      lanes[lane].playing = false
      lanes[lane].gain = 0
      lanes[lane].target = 0
      lanes[lane].startPending = false
      lanes[lane].stopPending = false
    }
    os_unfair_lock_unlock(lock)
    if same || path.isEmpty { return }
    loader.async { [weak self] in
      guard let self = self, let decoded = LoopPlayer.decode(path: path) else { return }
      os_unfair_lock_lock(self.lock)
      if self.lanes[lane].path == path { self.lanes[lane].raw = decoded }
      os_unfair_lock_unlock(self.lock)
      self.considerStretch(lane)
      self.onLoaded?(lane)
    }
  }

  /// Can the lane start now? Its file is decoded and, when it needs a stretched copy, the copy is ready too
  /// (so a loop never starts at the wrong pitch for a moment).
  func isReady(_ lane: Int) -> Bool {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return false }
    os_unfair_lock_lock(lock)
    defer { os_unfair_lock_unlock(lock) }
    let ln = lanes[lane]
    guard let raw = ln.raw else { return false }
    if ln.wantSeconds <= 0.05 { return true }
    if ln.wantFrames <= 0 { return false }
    if LoopPlayer.closeEnough(ln.wantFrames, raw.frames) { return true }
    if ln.failedFrames == ln.wantFrames { return true }
    return ln.stretched != nil && ln.stretchedFrames == ln.wantFrames
  }

  func setMix(lane: Int, level: Float, pan: Float) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    lanes[lane].level = max(0, min(4, level))
    lanes[lane].pan = max(-1, min(1, pan))
    if lanes[lane].playing { lanes[lane].target = lanes[lane].level }
    os_unfair_lock_unlock(lock)
  }

  /// Tell the lane how long its bars last at the current tempo, whether its pitch follows the tempo, and its
  /// shift in semitones. A stretched copy of the right length is made in the background if one is needed and
  /// there is not one yet. Safe to call as often as the tempo or the settings change; a lane that is playing
  /// keeps its place.
  func fit(lane: Int, seconds: Double, repeats: Int, follow: Bool, semis: Int) {
    guard lane >= 0, lane < LoopPlayer.laneCount, seconds > 0.05 else { return }
    os_unfair_lock_lock(lock)
    lanes[lane].wantSeconds = seconds
    lanes[lane].wantRepeats = max(1, repeats)
    lanes[lane].follow = follow
    lanes[lane].semis = max(-24, min(24, semis))
    os_unfair_lock_unlock(lock)
    considerStretch(lane)
  }

  /// Start from the top. `seconds` is how long the loop's bars last at the current tempo. With `at` (an
  /// engine-clock time, see MidiBedTestSynth.syncClock) the start happens on that exact sample; 0 = now.
  func start(lane: Int, seconds: Double, repeats: Int = 1, at: Double = 0) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    if lanes[lane].raw != nil, seconds > 0.05 {
      lanes[lane].wantSeconds = seconds
      lanes[lane].wantRepeats = max(1, repeats)
      if at > 0 {
        lanes[lane].startPending = true
        lanes[lane].startAt = at
      } else {
        lanes[lane].startPending = false
        applyCommand(lane, 1)
      }
    }
    os_unfair_lock_unlock(lock)
  }

  /// Fade out and stop, at once or (with `at`) at that engine-clock time.
  func stop(lane: Int, fade: Float = 0.03, at: Double = 0) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    if at > 0 {
      lanes[lane].stopPending = true
      lanes[lane].stopAt = at
      lanes[lane].stopFade = max(0.005, fade)
    } else {
      lanes[lane].startPending = false
      lanes[lane].stopPending = false
      lanes[lane].stopFade = max(0.005, fade)
      applyCommand(lane, 2)
    }
    os_unfair_lock_unlock(lock)
  }

  /// A scheduled command takes effect (the lock is held). 1 start from the top, 2 fade out.
  private func applyCommand(_ lane: Int, _ kind: Int) {
    if kind == 1 {
      lanes[lane].startPending = false
      guard lanes[lane].raw != nil else { return }
      lanes[lane].pos = 0
      lanes[lane].posFrames = 0
      lanes[lane].playing = true
      lanes[lane].target = lanes[lane].level
      lanes[lane].fadeSec = 0.008
    } else {
      lanes[lane].stopPending = false
      lanes[lane].target = 0
      lanes[lane].fadeSec = max(0.005, lanes[lane].stopFade)
    }
  }

  func stopAll(fade: Float = 0.03) {
    for i in 0..<LoopPlayer.laneCount { stop(lane: i, fade: fade) }
  }

  /// A stretch of less than this much (0.3 percent) is not worth making: the file already has the right length.
  private static func closeEnough(_ want: Int, _ have: Int) -> Bool {
    have > 0 && abs(Double(want) / Double(have) - 1) <= 0.003
  }

  /// Work out the pitch ratio P (see the class comment) and the length a copy for it should have; if the file is
  /// not already that length and there is no such copy yet, make one in the background. A copy that is no longer
  /// wanted by the time its turn comes is skipped, so stepping quickly through semitones only makes the last one.
  private func considerStretch(_ lane: Int) {
    os_unfair_lock_lock(lock)
    guard let raw = lanes[lane].raw, lanes[lane].wantSeconds > 0.05 else {
      os_unfair_lock_unlock(lock)
      return
    }
    let period = lanes[lane].wantSeconds / Double(lanes[lane].wantRepeats) * raw.rate // frames of one pass at the file's rate
    let fitSpeed = Double(raw.frames) / max(1, period)
    let ratio = (lanes[lane].follow ? fitSpeed : 1) * pow(2, Double(lanes[lane].semis) / 12)
    let want = max(1, Int((period * ratio).rounded()))
    lanes[lane].wantFrames = want
    var run = false
    if LoopPlayer.closeEnough(want, raw.frames) {
      lanes[lane].stretched = nil
      lanes[lane].stretchedFrames = 0
    } else if lanes[lane].stretchedFrames != want && lanes[lane].pendingFrames != want && lanes[lane].failedFrames != want {
      lanes[lane].pendingFrames = want
      run = true
    }
    os_unfair_lock_unlock(lock)
    guard run else { return }
    loader.async { [weak self] in
      guard let self = self else { return }
      // Still wanted? (The tempo, the shift or the file may have changed while this waited its turn.)
      os_unfair_lock_lock(self.lock)
      let wanted = self.lanes[lane].raw === raw && self.lanes[lane].wantFrames == want
      if !wanted && self.lanes[lane].pendingFrames == want { self.lanes[lane].pendingFrames = 0 }
      os_unfair_lock_unlock(self.lock)
      guard wanted else { return }
      let made = LoopPlayer.stretch(raw, outFrames: want)
      os_unfair_lock_lock(self.lock)
      if self.lanes[lane].raw === raw && self.lanes[lane].wantFrames == want {
        if let m = made {
          self.lanes[lane].stretched = m
          self.lanes[lane].stretchedFrames = want
        } else {
          self.lanes[lane].failedFrames = want
        }
      }
      if self.lanes[lane].pendingFrames == want { self.lanes[lane].pendingFrames = 0 }
      os_unfair_lock_unlock(self.lock)
      self.onLoaded?(lane)
    }
  }

  // MARK: Audio thread

  /// Render `frames` samples of every lane into the shared output blocks (stereo). `bufStart` is the engine-clock
  /// time of the block's first frame (infinity when unknown) and `secPerFrame` the length of one frame: a start or
  /// stop scheduled for a time inside this block happens on its exact frame. Returns false when nothing is
  /// playing (or the lock was busy), so the caller can skip adding it.
  func renderBlock(frames: Int, bufStart: Double = .infinity, secPerFrame: Double = 1.0 / 44100) -> Bool {
    guard frames > 0, frames <= blockCapacity, os_unfair_lock_trylock(lock) else { return false }
    defer { os_unfair_lock_unlock(lock) }
    var rendered = false
    for lane in 0..<LoopPlayer.laneCount {
      // Commands due in this block, as frame offsets (-1 = none).
      var startOff = -1
      var stopOff = -1
      if lanes[lane].startPending { startOff = LoopPlayer.offset(lanes[lane].startAt, bufStart, secPerFrame, frames) }
      if lanes[lane].stopPending { stopOff = LoopPlayer.offset(lanes[lane].stopAt, bufStart, secPerFrame, frames) }
      if !lanes[lane].playing && startOff < 0 {
        // A stop for a lane that is not playing has nothing to do; do not keep it waiting.
        if stopOff >= 0 { lanes[lane].stopPending = false }
        continue
      }
      if !rendered {
        for i in 0..<frames {
          outL[i] = 0
          outR[i] = 0
        }
        rendered = true
      }
      // Up to two commands split the block into pieces.
      var firstOff = frames
      var firstKind = 0
      var secondOff = frames
      var secondKind = 0
      if startOff >= 0 {
        firstOff = startOff
        firstKind = 1
      }
      if stopOff >= 0 {
        if stopOff < firstOff {
          secondOff = firstOff
          secondKind = firstKind
          firstOff = stopOff
          firstKind = 2
        } else {
          secondOff = stopOff
          secondKind = 2
        }
      }
      renderPiece(lane, 0, firstOff)
      if firstKind != 0 {
        applyCommand(lane, firstKind)
        renderPiece(lane, firstOff, secondOff)
        if secondKind != 0 {
          applyCommand(lane, secondKind)
          renderPiece(lane, secondOff, frames)
        }
      }
    }
    return rendered
  }

  /// The frame a scheduled time falls on within a block, 0 if it is already past, -1 if it is after the block.
  private static func offset(_ at: Double, _ bufStart: Double, _ secPerFrame: Double, _ frames: Int) -> Int {
    if bufStart.isInfinite || at <= bufStart { return 0 }
    let k = Int((at - bufStart) / secPerFrame)
    return k < frames ? k : -1
  }

  /// Render one lane over frames `from` up to (not including) `to`, adding to the shared blocks.
  private func renderPiece(_ lane: Int, _ from: Int, _ to: Int) {
    guard to > from, lanes[lane].playing else { return }
    // The stretched copy if there is one (while a new one is being made the old one plays at a slightly
    // adjusted speed), otherwise the file itself.
    let source: Buf? = lanes[lane].stretched != nil ? lanes[lane].stretched : lanes[lane].raw
    guard let b = source else {
      lanes[lane].playing = false
      return
    }
    let n = Double(b.frames)
    // Switching between the file and its stretched copy keeps the place within the loop.
    if lanes[lane].posFrames != b.frames {
      if lanes[lane].posFrames > 0 { lanes[lane].pos = lanes[lane].pos * n / Double(lanes[lane].posFrames) }
      lanes[lane].posFrames = b.frames
    }
    var pos = lanes[lane].pos
    // File frames per output sample: the buffer's frames, times its repeats in the period, over the
    // output samples in the period. For a copy stretched to exactly the period this is rate / sampleRate.
    let step = n * Double(max(1, lanes[lane].wantRepeats)) / max(0.05, lanes[lane].wantSeconds) / Double(sampleRate)
    var gain = lanes[lane].gain
    let target = lanes[lane].target
    let coef: Float = 1 - expf(-1 / (sampleRate * max(0.002, lanes[lane].fadeSec)))
    let pan = lanes[lane].pan
    let gl: Float = pan > 0 ? 1 - pan : 1
    let gr: Float = pan < 0 ? 1 + pan : 1
    for i in from..<to {
      gain += (target - gain) * coef
      var i0 = Int(pos)
      if i0 >= b.frames { i0 = 0; pos -= n }
      var i1 = i0 + 1
      if i1 >= b.frames { i1 = 0 }
      let f = Float(pos - Double(i0))
      let sl = b.l[i0] + (b.l[i1] - b.l[i0]) * f
      let sr = b.r[i0] + (b.r[i1] - b.r[i0]) * f
      outL[i] += sl * gain * gl
      outR[i] += sr * gain * gr
      pos += step
      if pos >= n { pos -= n }
    }
    lanes[lane].pos = pos
    lanes[lane].gain = gain
    if target == 0 && gain < 0.0005 {
      lanes[lane].playing = false
      lanes[lane].gain = 0
    }
  }

  /// The block rendered by the last `renderBlock` call (valid until the next one).
  var left: UnsafeMutablePointer<Float> { outL }
  var right: UnsafeMutablePointer<Float> { outR }

  // MARK: Time-stretch

  /// Pitch-keeping time-stretch of a whole loop to exactly `outFrames` frames: circular WSOLA. The loop is
  /// cut into overlapping 25 ms frames (Hann windows, half overlap); frame k is taken from near the place
  /// k / hops of the way through the input, nudged (within about a third of a frame either way) to wherever
  /// it best continues the frame before (normalised cross-correlation of a mono mix), and the frames are added
  /// together at an even spacing through the output. Input and output are both treated as circles, so the
  /// loop's end joins its start without a seam. Checked offline with a numpy port (scratchpad wsola.py): a
  /// 440 Hz sine stays at 439.6-439.8 Hz, lengths are exact, and a click train keeps every click (none
  /// doubled or lost, timing within a few ms). Returns nil for a file too short to stretch (then the plain
  /// speed change is used).
  private static func stretch(_ src: Buf, outFrames: Int) -> Buf? {
    let n = src.frames
    var frame = Int((src.rate * 0.025).rounded())
    frame = max(256, min(2048, frame))
    frame -= frame % 2
    let half = frame / 2
    guard n >= 4 * frame, outFrames >= 4 * frame else { return nil }

    var win = [Float](repeating: 0, count: frame)
    for i in 0..<frame { win[i] = Float(0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(frame))) }
    let hops = max(1, Int((Double(outFrames) / Double(half)).rounded()))
    let hOut = Double(outFrames) / Double(hops)
    let hIn = Double(n) / Double(hops)
    let delta = max(32, frame / 3)

    // The mono mix three times end to end, so a search position just before the start or past the end is a plain index.
    var mono = [Float](repeating: 0, count: 3 * n)
    for i in 0..<n {
      let v = 0.5 * (src.l[i] + src.r[i])
      mono[i] = v
      mono[n + i] = v
      mono[2 * n + i] = v
    }

    // Where each frame is taken from (an unwrapped input position; may be a little below 0 or above n).
    var pos = [Int](repeating: 0, count: hops)
    var tmpl = [Float](repeating: 0, count: half)
    mono.withUnsafeBufferPointer { m in
      var k = 1
      while k < hops {
        let ideal = Int((Double(k) * hIn).rounded())
        let prev = pos[k - 1]
        // What the previous frame's second half is: the next frame's start should continue it.
        for i in 0..<half { tmpl[i] = m[n + prev + half + i] }
        var best = ideal
        var bestScore = -Double.greatestFiniteMagnitude
        var c = ideal - delta
        var energy = 0.0
        for i in 0..<half {
          let v = Double(m[n + c + i])
          energy += v * v
        }
        while c <= ideal + delta {
          let base = n + c
          var dot: Float = 0
          for i in 0..<half { dot += m[base + i] * tmpl[i] }
          let score = Double(dot) / (energy + 1e-9).squareRoot()
          if score > bestScore {
            bestScore = score
            best = c
          }
          // Slide the candidate window one sample along.
          let leaving = Double(m[base])
          let entering = Double(m[base + half])
          energy += entering * entering - leaving * leaving
          if energy < 0 { energy = 0 }
          c += 1
        }
        pos[k] = best
        k += 1
      }
    }

    let out = Buf(frames: outFrames, rate: src.rate)
    let wsum = UnsafeMutablePointer<Float>.allocate(capacity: outFrames)
    defer { wsum.deallocate() }
    for i in 0..<outFrames {
      out.l[i] = 0
      out.r[i] = 0
      wsum[i] = 0
    }
    for k in 0..<hops {
      var s = ((pos[k] % n) + n) % n
      var o = Int((Double(k) * hOut).rounded()) % outFrames
      for i in 0..<frame {
        let wv = win[i]
        out.l[o] += wv * src.l[s]
        out.r[o] += wv * src.r[s]
        wsum[o] += wv
        s += 1
        if s >= n { s = 0 }
        o += 1
        if o >= outFrames { o = 0 }
      }
    }
    // The windows add up to 1 apart from small rounding in the spacing; divide that out.
    for i in 0..<outFrames {
      let w = wsum[i]
      if w > 1e-3 {
        out.l[i] /= w
        out.r[i] /= w
      }
    }
    return out
  }

  // MARK: Decoding

  /// Read a whole file as float stereo. Mono files are copied to both sides.
  private static func decode(path: String) -> Buf? {
    let url = URL(fileURLWithPath: path)
    guard let file = try? AVAudioFile(forReading: url) else { return nil }
    let format = file.processingFormat
    let total = AVAudioFrameCount(file.length)
    guard total > 0, let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: total) else { return nil }
    do { try file.read(into: pcm) } catch { return nil }
    guard let data = pcm.floatChannelData else { return nil }
    let frames = Int(pcm.frameLength)
    let channels = Int(format.channelCount)
    let buf = Buf(frames: frames, rate: format.sampleRate)
    for i in 0..<frames {
      let l = data[0][i]
      buf.l[i] = l
      buf.r[i] = channels > 1 ? data[1][i] : l
    }
    return buf
  }

  /// Length, rate, channels and loudness (the highest sample and the RMS over every channel) of a file,
  /// read in blocks without keeping it, for the library.
  static func probe(path: String) -> (seconds: Double, sampleRate: Double, channels: Int, peak: Double, rms: Double)? {
    guard let file = try? AVAudioFile(forReading: URL(fileURLWithPath: path)) else { return nil }
    let format = file.processingFormat
    let rate = format.sampleRate
    guard rate > 0 else { return nil }
    let channels = Int(format.channelCount)
    var peak: Float = 0
    var sumSquares = 0.0
    var samples = 0.0
    let block: AVAudioFrameCount = 32768
    if let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: block) {
      while file.framePosition < file.length {
        do { try file.read(into: buf, frameCount: block) } catch { break }
        let n = Int(buf.frameLength)
        if n == 0 { break }
        guard let data = buf.floatChannelData else { break }
        for c in 0..<channels {
          let p = data[c]
          var local: Double = 0
          for i in 0..<n {
            let v = p[i]
            let a = abs(v)
            if a > peak { peak = a }
            local += Double(v) * Double(v)
          }
          sumSquares += local
          samples += Double(n)
        }
      }
    }
    let rms = samples > 0 ? (sumSquares / samples).squareRoot() : 0
    return (Double(file.length) / rate, rate, channels, Double(peak), rms)
  }
}
