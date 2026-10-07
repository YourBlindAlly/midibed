import Foundation
import CoreMIDI
import AVFoundation

// MARK: - Config (decoded from the JSON string the JS side sends)

struct MidiBedDrumConfig: Decodable {
  var enabled: Bool
  var note: Int
  var channel: Int
  var steps: Int
  var hits: Int
  var rotation: Int
  var velocity: Int
  var probability: Double   // 0...1 chance each scheduled hit actually plays
  var humanize: Double      // 0...1 random velocity wobble
}

struct MidiBedDroneConfig: Decodable {
  var enabled: Bool
  var channel: Int
  var notes: [Int]
  var velocity: Int
  var retriggerBars: Int    // 0 = hold until stopped
}

struct MidiBedWandererConfig: Decodable {
  var enabled: Bool
  var cc: Int
  var channel: Int
  var min: Int
  var max: Int
  var speed: Double         // fraction of the min..max range travelled per second
  var smooth: Double        // seconds of easing
}

struct MidiBedConfig: Decodable {
  var bpm: Double
  var swing: Double         // 0...1, delays every other 16th
  var midiOut: Bool
  var synthOut: Bool
  var drums: [MidiBedDrumConfig]
  var drone: MidiBedDroneConfig
  var wanderers: [MidiBedWandererConfig]
}

// MARK: - Engine

/// Generates MIDI on its own clock and sends it out a CoreMIDI virtual source
/// (named "MidiBed", visible to AUM etc.) and/or into the built-in test synth.
///
/// Everything below `queue` is touched only on that serial queue, so no locks are
/// needed. JS never schedules musical timing: it only pushes parameter changes.
///
/// Time base: 96 ticks per quarter note, 24 ticks per 16th step, 4/4.
final class MidiBedEngine {
  private let ticksPerBeat = 96
  private let ticksPerStep = 24
  private let beatsPerBar = 4

  private let queue = DispatchQueue(label: "midibed.engine", qos: .userInteractive)
  private var timer: DispatchSourceTimer?

  private var client = MIDIClientRef()
  private var source = MIDIEndpointRef()
  let synth = MidiBedTestSynth()

  /// Called on the main queue once per beat with (bar, beat), both 1-based.
  var onBeat: ((Int, Int) -> Void)?

  // Control state (queue-only).
  private var config: MidiBedConfig?
  private var running = false
  private var tickIndex = 0
  private var nextTickTime: Double = 0
  private var lastWandererTime: Double = 0

  private struct Pending {
    var time: Double
    var status: UInt8
    var d1: UInt8
    var d2: UInt8
  }
  private var pending: [Pending] = []

  private struct HeldNote: Equatable {
    var channel: Int
    var note: Int
  }
  private var heldDrone: [HeldNote] = []

  private struct WandererState {
    var pos: Double
    var target: Double
    var shown: Double
    var lastSent: Int
  }
  private var wanderers: [WandererState] = []

  private var rng = SystemRandomNumberGenerator()

  init() {
    MIDIClientCreate("MidiBed" as CFString, nil, nil, &client)
    // MIDISourceCreate is deprecated on iOS 14+ in favour of the protocol-based
    // variant but still works and is what every receiving app understands.
    MIDISourceCreate(client, "MidiBed" as CFString, &source)
    synth.startEngine()

    NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] note in
      guard
        let info = note.userInfo,
        let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
        let type = AVAudioSession.InterruptionType(rawValue: raw),
        type == .ended
      else { return }
      self?.synth.restartIfNeeded()
    }
  }

  // MARK: Public (thread-safe: everything hops onto `queue`)

  func applyConfig(json: String) {
    guard let data = json.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(MidiBedConfig.self, from: data)
    else {
      NSLog("MidiBedEngine: could not decode config")
      return
    }
    queue.async {
      self.config = decoded
      self.synth.enabled = decoded.synthOut
      self.syncWanderers()
      if self.running { self.reconcileDrone() }
    }
  }

  func start() {
    // Self-heal the built-in synth if iOS stopped its audio engine (route change).
    DispatchQueue.main.async { self.synth.restartIfNeeded() }
    queue.async {
      guard !self.running else { return }
      self.running = true
      self.tickIndex = 0
      self.nextTickTime = ProcessInfo.processInfo.systemUptime + 0.05
      self.lastWandererTime = self.nextTickTime
      self.syncWanderers()
      self.reconcileDrone()
      let t = DispatchSource.makeTimerSource(flags: .strict, queue: self.queue)
      t.schedule(deadline: .now(), repeating: .milliseconds(2), leeway: .microseconds(200))
      t.setEventHandler { [weak self] in self?.pump() }
      self.timer = t
      t.resume()
    }
  }

  func stop() {
    queue.async {
      guard self.running else { return }
      self.running = false
      self.timer?.cancel()
      self.timer = nil
      self.pending.removeAll()
      self.releaseDrone()
      self.allNotesOff()
    }
  }

  /// One-off control change, usable whether or not the transport is running
  /// (MIDI-learn sweeps, manual nudges).
  func sendControlChange(channel: Int, cc: Int, value: Int) {
    queue.async {
      self.emit(0xB0 | UInt8(max(0, min(15, channel))), UInt8(max(0, min(127, cc))), UInt8(max(0, min(127, value))))
    }
  }

  /// Optional Bank Select (CC 0 / CC 32; pass a negative number to skip) then
  /// Program Change, so the receiving app switches sound.
  func sendProgramChange(channel: Int, program: Int, bankMSB: Int, bankLSB: Int) {
    queue.async {
      let ch = UInt8(max(0, min(15, channel)))
      if bankMSB >= 0 { self.emit(0xB0 | ch, 0, UInt8(min(127, bankMSB))) }
      if bankLSB >= 0 { self.emit(0xB0 | ch, 32, UInt8(min(127, bankLSB))) }
      self.emit(0xC0 | ch, UInt8(max(0, min(127, program))), 0)
    }
  }

  func status() -> [String: Any] {
    // Cheap snapshot for the UI; reading these without the queue is benign.
    return ["running": running, "tick": tickIndex]
  }

  // MARK: Clock

  private func pump() {
    guard running, let cfg = config else { return }
    let now = ProcessInfo.processInfo.systemUptime

    // If the process was stalled (backgrounded without audio, debugger), resync
    // instead of firing a burst of catch-up ticks.
    if now - nextTickTime > 0.5 {
      nextTickTime = now
      lastWandererTime = now
    }

    let tickDur = 60.0 / (max(20.0, min(300.0, cfg.bpm)) * Double(ticksPerBeat))
    while nextTickTime <= now {
      processTick(tickIndex, at: nextTickTime, tickDur: tickDur, cfg: cfg)
      tickIndex += 1
      nextTickTime += tickDur
    }

    updateWanderers(now: now, cfg: cfg)
    drainPending(now: now)
  }

  private func processTick(_ tick: Int, at time: Double, tickDur: Double, cfg: MidiBedConfig) {
    let barTicks = ticksPerBeat * beatsPerBar

    if tick % ticksPerBeat == 0 {
      let beatTotal = tick / ticksPerBeat
      let bar = beatTotal / beatsPerBar + 1
      let beat = beatTotal % beatsPerBar + 1
      let cb = onBeat
      DispatchQueue.main.async { cb?(bar, beat) }
    }

    // Drone retrigger.
    if cfg.drone.enabled, cfg.drone.retriggerBars > 0, tick > 0,
      tick % (barTicks * cfg.drone.retriggerBars) == 0
    {
      releaseDrone()
      reconcileDrone()
    }

    guard tick % ticksPerStep == 0 else { return }
    let step = tick / ticksPerStep
    let stepDur = tickDur * Double(ticksPerStep)

    // Swing: push every second 16th later, up to half a step.
    let swingDelay = (step % 2 == 1) ? max(0, min(1, cfg.swing)) * stepDur * 0.5 : 0

    for drum in cfg.drums where drum.enabled {
      let steps = max(1, min(64, drum.steps))
      let hits = max(0, min(steps, drum.hits))
      let pos = ((step % steps) - drum.rotation % steps + steps) % steps
      guard euclidHit(position: pos, hits: hits, steps: steps) else { continue }
      if drum.probability < 1, Double.random(in: 0..<1, using: &rng) > drum.probability { continue }

      var vel = Double(drum.velocity)
      if drum.humanize > 0 {
        vel *= 1 - drum.humanize * 0.4 * Double.random(in: 0..<1, using: &rng)
      }
      let v = UInt8(max(1, min(127, Int(vel))))
      let ch = UInt8(max(0, min(15, drum.channel)))
      let start = time + swingDelay
      pending.append(Pending(time: start, status: 0x90 | ch, d1: UInt8(max(0, min(127, drum.note))), d2: v))
      pending.append(Pending(time: start + 0.09, status: 0x80 | ch, d1: UInt8(max(0, min(127, drum.note))), d2: 0))
    }
  }

  /// Standard Euclidean spread: hit when (pos * hits) mod steps < hits.
  private func euclidHit(position: Int, hits: Int, steps: Int) -> Bool {
    if hits <= 0 { return false }
    return (position * hits) % steps < hits
  }

  // MARK: Drone

  private func desiredDrone() -> [HeldNote] {
    guard let d = config?.drone, d.enabled, running else { return [] }
    let ch = max(0, min(15, d.channel))
    return d.notes.map { HeldNote(channel: ch, note: max(0, min(127, $0))) }
  }

  private func reconcileDrone() {
    let wanted = desiredDrone()
    let vel = UInt8(max(1, min(127, config?.drone.velocity ?? 80)))
    for held in heldDrone where !wanted.contains(held) {
      emit(0x80 | UInt8(held.channel), UInt8(held.note), 0)
    }
    for note in wanted where !heldDrone.contains(note) {
      emit(0x90 | UInt8(note.channel), UInt8(note.note), vel)
    }
    heldDrone = wanted
  }

  private func releaseDrone() {
    for held in heldDrone {
      emit(0x80 | UInt8(held.channel), UInt8(held.note), 0)
    }
    heldDrone = []
  }

  // MARK: CC wanderers

  private func syncWanderers() {
    guard let cfg = config else { return }
    while wanderers.count < cfg.wanderers.count {
      let p = Double.random(in: 0..<1, using: &rng)
      wanderers.append(WandererState(pos: p, target: Double.random(in: 0..<1, using: &rng), shown: p, lastSent: -1))
    }
    if wanderers.count > cfg.wanderers.count {
      wanderers.removeLast(wanderers.count - cfg.wanderers.count)
    }
  }

  private func updateWanderers(now: Double, cfg: MidiBedConfig) {
    let dt = now - lastWandererTime
    guard dt >= 0.02 else { return }
    lastWandererTime = now

    for (i, w) in cfg.wanderers.enumerated() where i < wanderers.count && w.enabled {
      var s = wanderers[i]
      if abs(s.target - s.pos) < 0.002 {
        s.target = Double.random(in: 0..<1, using: &rng)
      }
      let maxStep = max(0.0005, w.speed) * dt
      let delta = s.target - s.pos
      s.pos += max(-maxStep, min(maxStep, delta))
      let ease = 1 - exp(-dt / max(0.05, w.smooth))
      s.shown += (s.pos - s.shown) * ease

      let lo = Double(min(w.min, w.max))
      let hi = Double(max(w.min, w.max))
      let value = Int((lo + (hi - lo) * s.shown).rounded())
      if value != s.lastSent {
        s.lastSent = value
        emit(0xB0 | UInt8(max(0, min(15, w.channel))), UInt8(max(0, min(127, w.cc))), UInt8(max(0, min(127, value))))
      }
      wanderers[i] = s
    }
  }

  // MARK: Output

  private func drainPending(now: Double) {
    guard !pending.isEmpty else { return }
    var due: [Pending] = []
    var later: [Pending] = []
    for p in pending {
      if p.time <= now { due.append(p) } else { later.append(p) }
    }
    pending = later
    due.sort { $0.time < $1.time }
    for p in due { emit(p.status, p.d1, p.d2) }
  }

  private func allNotesOff() {
    for ch in 0..<16 {
      emit(0xB0 | UInt8(ch), 123, 0)
    }
  }

  private func emit(_ status: UInt8, _ d1: UInt8, _ d2: UInt8) {
    if config?.midiOut ?? true { sendMIDI(status, d1, d2) }
    if config?.synthOut ?? true { synth.post(status: status, d1: d1, d2: d2) }
    // Note-offs and all-notes-off must always reach the synth even if the
    // switch was just turned off, or a pad could hang. It ignores them harmlessly.
    else if (status & 0xF0) == 0x80 || ((status & 0xF0) == 0xB0 && d1 == 123) {
      synth.post(status: status, d1: d1, d2: d2)
    }
  }

  private func sendMIDI(_ status: UInt8, _ d1: UInt8, _ d2: UInt8) {
    guard source != 0 else { return }
    var packetList = MIDIPacketList()
    let packet = MIDIPacketListInit(&packetList)
    let bytes: [UInt8] = (status & 0xF0) == 0xC0 || (status & 0xF0) == 0xD0 ? [status, d1] : [status, d1, d2]
    _ = MIDIPacketListAdd(&packetList, MemoryLayout<MIDIPacketList>.size, packet, 0, bytes.count, bytes)
    MIDIReceived(source, &packetList)
  }
}
