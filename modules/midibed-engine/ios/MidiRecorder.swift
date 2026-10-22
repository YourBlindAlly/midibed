import Foundation

/// Collects what MidiBed plays and writes it as a Standard MIDI File (format 1): a tempo track plus one track
/// per MIDI channel, starting exactly on a bar line, so the file can be dropped into a DAW on a bar line and
/// lines up with its grid. Self-contained (Foundation only). Times are engine-clock seconds; the tempo may change
/// during a take (a journey switch), so the tempo changes are recorded too and written into the file.
final class MidiRecorder {
  struct Event {
    var time: Double
    var status: UInt8
    var d1: UInt8
    var d2: UInt8
    var order: Int
  }

  /// The file's time resolution: ticks per quarter note.
  static let division = 480

  private(set) var events: [Event] = []
  private var tempos: [(time: Double, bpm: Double)] = []
  private(set) var startTime: Double = 0
  private var counter = 0

  func reset(startTime: Double, bpm: Double) {
    events.removeAll()
    tempos = [(startTime, bpm)]
    self.startTime = startTime
    counter = 0
  }

  /// Note the tempo at `time` (only a change is kept).
  func tempo(_ bpm: Double, at time: Double) {
    guard let last = tempos.last, abs(last.bpm - bpm) > 0.0001, time >= startTime else { return }
    tempos.append((time, bpm))
  }

  /// Add one message (channel messages only; notes before the start of the take are left out).
  func add(time: Double, status: UInt8, d1: UInt8, d2: UInt8) {
    guard status >= 0x80, status < 0xF0, time >= startTime - 0.0005 else { return }
    let kind = status & 0xF0
    // the all-notes-off backstops are not music
    if kind == 0xB0 && (d1 == 120 || d1 == 123) { return }
    counter += 1
    events.append(Event(time: max(time, startTime), status: status, d1: d1, d2: d2, order: counter))
  }

  /// Quarter notes from the start of the take to `time`, following the tempo changes.
  func beats(at time: Double) -> Double {
    var total = 0.0
    for i in 0..<tempos.count {
      let from = tempos[i].time
      let to = i + 1 < tempos.count ? min(tempos[i + 1].time, time) : time
      if to > from { total += (to - from) * tempos[i].bpm / 60.0 }
      if i + 1 < tempos.count && tempos[i + 1].time >= time { break }
    }
    return total
  }

  private func ticks(at time: Double) -> Int {
    Int((beats(at: time) * Double(MidiRecorder.division)).rounded())
  }

  /// Is there any note in the take?
  var hasNotes: Bool {
    events.contains { ($0.status & 0xF0) == 0x90 && $0.d2 > 0 }
  }

  private static func vlq(_ value: Int) -> [UInt8] {
    var v = max(0, value)
    var out: [UInt8] = [UInt8(v & 0x7F)]
    v >>= 7
    while v > 0 {
      out.insert(UInt8(v & 0x7F) | 0x80, at: 0)
      v >>= 7
    }
    return out
  }

  private static func be32(_ v: Int) -> [UInt8] {
    [UInt8((v >> 24) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF)]
  }

  private static func chunk(_ tag: String, _ body: [UInt8]) -> [UInt8] {
    Array(tag.utf8) + be32(body.count) + body
  }

  private static func nameEvent(_ text: String) -> [UInt8] {
    let bytes = Array(text.utf8)
    return [0x00, 0xFF, 0x03] + vlq(bytes.count) + bytes
  }

  /// Build the file. `endTime` is when the take ended; it is rounded up to whole bars. `names` labels a channel's
  /// track. Returns nil if nothing was played. `bars` is the length of the file in bars.
  func fileData(endTime: Double, beatsPerBar: Int, names: [Int: String]) -> (data: Data, bars: Int)? {
    guard hasNotes else { return nil }
    let div = MidiRecorder.division
    let barTicks = div * beatsPerBar
    let endTicks = ticks(at: max(endTime, startTime))
    var bars = Int((Double(endTicks) / Double(barTicks) - 0.02).rounded(.up))
    bars = max(1, bars)
    let lengthTicks = bars * barTicks

    // Track 0: name, time signature, tempo changes.
    var t0: [UInt8] = MidiRecorder.nameEvent("MidiBed")
    t0 += [0x00, 0xFF, 0x58, 0x04, UInt8(beatsPerBar), 0x02, 0x18, 0x08]
    var lastTick = 0
    for tp in tempos {
      let tk = min(lengthTicks, max(lastTick, ticks(at: tp.time)))
      let micros = Int((60_000_000.0 / max(20.0, min(300.0, tp.bpm))).rounded())
      t0 += MidiRecorder.vlq(tk - lastTick)
      t0 += [0xFF, 0x51, 0x03, UInt8((micros >> 16) & 0xFF), UInt8((micros >> 8) & 0xFF), UInt8(micros & 0xFF)]
      lastTick = tk
    }
    t0 += MidiRecorder.vlq(lengthTicks - lastTick) + [0xFF, 0x2F, 0x00]

    // One track per channel that played something.
    var channels = Set<Int>()
    for e in events { channels.insert(Int(e.status & 0x0F)) }
    var tracks: [[UInt8]] = [t0]
    for ch in channels.sorted() {
      var list = events.filter { Int($0.status & 0x0F) == ch }
      // Time order; at the same moment, note-offs first, then the rest in the order they were made.
      list.sort {
        if $0.time != $1.time { return $0.time < $1.time }
        let off0 = ($0.status & 0xF0) == 0x80 || (($0.status & 0xF0) == 0x90 && $0.d2 == 0)
        let off1 = ($1.status & 0xF0) == 0x80 || (($1.status & 0xF0) == 0x90 && $1.d2 == 0)
        if off0 != off1 { return off0 }
        return $0.order < $1.order
      }
      var body: [UInt8] = MidiRecorder.nameEvent(names[ch] ?? "Channel \(ch + 1)")
      var prev = 0
      var open = Set<Int>()
      for e in list {
        let tk = min(lengthTicks, max(prev, ticks(at: e.time)))
        let kind = e.status & 0xF0
        if kind == 0x90 && e.d2 > 0 { open.insert(Int(e.d1)) }
        if kind == 0x80 || (kind == 0x90 && e.d2 == 0) { open.remove(Int(e.d1)) }
        body += MidiRecorder.vlq(tk - prev)
        if kind == 0xC0 || kind == 0xD0 {
          body += [e.status, e.d1]
        } else {
          body += [e.status, e.d1, e.d2]
        }
        prev = tk
      }
      // notes still sounding at the end are closed at the end of the last bar
      for n in open.sorted() {
        body += MidiRecorder.vlq(lengthTicks - prev) + [0x80 | UInt8(ch), UInt8(n), 0]
        prev = lengthTicks
      }
      body += MidiRecorder.vlq(lengthTicks - prev) + [0xFF, 0x2F, 0x00]
      tracks.append(body)
    }

    var file: [UInt8] = Array("MThd".utf8) + MidiRecorder.be32(6) + [0x00, 0x01, UInt8((tracks.count >> 8) & 0xFF), UInt8(tracks.count & 0xFF), UInt8((div >> 8) & 0xFF), UInt8(div & 0xFF)]
    for t in tracks { file += MidiRecorder.chunk("MTrk", t) }
    return (Data(file), bars)
  }
}
