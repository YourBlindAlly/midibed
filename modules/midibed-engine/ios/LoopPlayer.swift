import AVFoundation
import Foundation

/// Four lanes of audio loops for the built-in sound ("Loop player").
///
/// A lane holds one decoded audio file (any format AVAudioFile reads: WAV, AIFF, CAF, MP3, M4A, FLAC). The
/// engine starts a lane on a bar line and restarts it every `bars` bars, and tells it how long those bars
/// last in seconds; the lane plays at exactly the speed that makes the file fill that time (a plain speed
/// change: a few percent moves the pitch a little, which is fine for percussion). Because the engine restarts
/// the loop on a bar line every time round, the audio clock can never drift away from the bed.
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
    var buf: Buf?
    var path = ""
    var playing = false
    var pos: Double = 0     // in file frames
    var step: Double = 1    // file frames per output sample
    var gain: Float = 0     // smoothed
    var target: Float = 0
    var level: Float = 1
    var pan: Float = 0
    var fadeSec: Float = 0.01
  }

  private var lanes = [Lane](repeating: Lane(), count: LoopPlayer.laneCount)
  private let lock: UnsafeMutablePointer<os_unfair_lock_s>
  private var sampleRate: Float = 44100
  private let blockCapacity = 8192
  private let outL: UnsafeMutablePointer<Float>
  private let outR: UnsafeMutablePointer<Float>
  private let loader = DispatchQueue(label: "midibed.loops.decode", qos: .userInitiated)

  /// Called (on the loader queue) when a lane's file has finished decoding.
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
      lanes[lane].buf = nil
      lanes[lane].playing = false
      lanes[lane].gain = 0
      lanes[lane].target = 0
    }
    os_unfair_lock_unlock(lock)
    if same || path.isEmpty { return }
    loader.async { [weak self] in
      guard let self = self, let decoded = LoopPlayer.decode(path: path) else { return }
      os_unfair_lock_lock(self.lock)
      if self.lanes[lane].path == path { self.lanes[lane].buf = decoded }
      os_unfair_lock_unlock(self.lock)
      self.onLoaded?(lane)
    }
  }

  func isReady(_ lane: Int) -> Bool {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return false }
    os_unfair_lock_lock(lock)
    let ok = lanes[lane].buf != nil
    os_unfair_lock_unlock(lock)
    return ok
  }

  func setMix(lane: Int, level: Float, pan: Float) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    lanes[lane].level = max(0, min(1.5, level))
    lanes[lane].pan = max(-1, min(1, pan))
    if lanes[lane].playing { lanes[lane].target = lanes[lane].level }
    os_unfair_lock_unlock(lock)
  }

  /// Start from the top. `seconds` is how long the loop's bars last at the current tempo.
  func start(lane: Int, seconds: Double, repeats: Int = 1) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    if let b = lanes[lane].buf, seconds > 0.05 {
      let fileSeconds = Double(b.frames) / b.rate
      lanes[lane].step = (fileSeconds * Double(max(1, repeats)) / seconds) * b.rate / Double(sampleRate)
      lanes[lane].pos = 0
      lanes[lane].playing = true
      lanes[lane].target = lanes[lane].level
      lanes[lane].fadeSec = 0.008
    }
    os_unfair_lock_unlock(lock)
  }

  /// A tempo change while a lane plays: new speed, same place.
  func retune(lane: Int, seconds: Double, repeats: Int = 1) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    if let b = lanes[lane].buf, seconds > 0.05 {
      let fileSeconds = Double(b.frames) / b.rate
      lanes[lane].step = (fileSeconds * Double(max(1, repeats)) / seconds) * b.rate / Double(sampleRate)
    }
    os_unfair_lock_unlock(lock)
  }

  /// Fade out and stop.
  func stop(lane: Int, fade: Float = 0.03) {
    guard lane >= 0, lane < LoopPlayer.laneCount else { return }
    os_unfair_lock_lock(lock)
    lanes[lane].target = 0
    lanes[lane].fadeSec = max(0.005, fade)
    os_unfair_lock_unlock(lock)
  }

  func stopAll(fade: Float = 0.03) {
    for i in 0..<LoopPlayer.laneCount { stop(lane: i, fade: fade) }
  }

  // MARK: Audio thread

  /// Render `frames` samples of every lane into the shared output blocks (stereo). Returns false when
  /// nothing is playing (or the lock was busy), so the caller can skip adding it.
  func renderBlock(frames: Int) -> Bool {
    guard frames > 0, frames <= blockCapacity, os_unfair_lock_trylock(lock) else { return false }
    defer { os_unfair_lock_unlock(lock) }
    var rendered = false
    for lane in 0..<LoopPlayer.laneCount where lanes[lane].playing {
      guard let b = lanes[lane].buf else {
        lanes[lane].playing = false
        continue
      }
      if !rendered {
        for i in 0..<frames {
          outL[i] = 0
          outR[i] = 0
        }
        rendered = true
      }
      let n = Double(b.frames)
      var pos = lanes[lane].pos
      let step = lanes[lane].step
      var gain = lanes[lane].gain
      let target = lanes[lane].target
      let coef: Float = 1 - expf(-1 / (sampleRate * max(0.002, lanes[lane].fadeSec)))
      let pan = lanes[lane].pan
      let gl: Float = pan > 0 ? 1 - pan : 1
      let gr: Float = pan < 0 ? 1 + pan : 1
      for i in 0..<frames {
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
    return rendered
  }

  /// The block rendered by the last `renderBlock` call (valid until the next one).
  var left: UnsafeMutablePointer<Float> { outL }
  var right: UnsafeMutablePointer<Float> { outR }

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

  /// Length, rate and channels of a file without keeping it (for the library).
  static func probe(path: String) -> (seconds: Double, sampleRate: Double, channels: Int)? {
    guard let file = try? AVAudioFile(forReading: URL(fileURLWithPath: path)) else { return nil }
    let rate = file.processingFormat.sampleRate
    guard rate > 0 else { return nil }
    return (Double(file.length) / rate, rate, Int(file.processingFormat.channelCount))
  }
}
