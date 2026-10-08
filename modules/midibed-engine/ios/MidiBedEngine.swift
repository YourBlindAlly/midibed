import Foundation
import CoreMIDI
import AVFoundation

// MARK: - Config (decoded from the JSON string the JS side sends)

struct MidiBedDrumConfig: Decodable {
  var enabled: Bool
  var role: String          // "kick", "snare" or "other" (which drums a breakdown silences)
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
  var chords: [[Int]]       // MIDI notes per chord; one entry = a steady drone
  var altChords: [[Int]]    // the same bass the other way round (follow <-> steady), for breathing
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

struct MidiBedPadConfig: Decodable {
  var enabled: Bool
  var channel: Int
  var velocity: Int
  var humanize: Double      // 0...1 random velocity wobble
  var strumMs: Double       // spread between chord-tone onsets, ascending
  var chords: [[Int]]       // MIDI notes per chord (one entry = a steady chord), computed on the JS side
  var altChords: [[Int]]    // what the pad flips to (a steady fifths drone), for breathing
}

/// The chord loop's timing. What each layer plays comes from its own `chords`
/// list, indexed by the chord the loop is on (modulo that list's length).
struct MidiBedHarmonyConfig: Decodable {
  var barsPerChord: Int
  var count: Int
}

/// Fades when a layer is switched on or off (and when Play is pressed).
/// Drone and pad fade by sending a volume-type CC on their channel; drums fade
/// by scaling note velocity, which works with any velocity-sensitive sound.
struct MidiBedFadeConfig: Decodable {
  var cc: Int               // 0 = no CC fade (notes just start/stop); usually 11 or 7
  var droneIn: Double       // seconds
  var droneOut: Double
  var padIn: Double
  var padOut: Double
  var drumIn: Double
  var drumOut: Double
}

/// A loop-playing app (like DrumJam's loops): not notes, just "choose this loop,
/// start, stop". Selection is Bank Select + Program Change; start and stop are
/// control changes (use the same number for both if the app has a play toggle).
struct MidiBedLoopsConfig: Decodable {
  var enabled: Bool
  var channel: Int
  var program: Int
  var bankMSB: Int          // negative = do not send
  var bankLSB: Int
  var startCC: Int          // 0 = none
  var stopCC: Int           // 0 = use startCC
}

/// "Breathing": a layer stays in its normal state for baseBars, then (with
/// probability chance, percent) flips to its alternate for altBars, and so on,
/// counted in bars from the start of the scene. baseBars 0 = off.
struct MidiBedMotionRule: Decodable {
  var baseBars: Int
  var altBars: Int
  var chance: Double
}

struct MidiBedBreakdown: Decodable {
  var baseBars: Int         // bars of normal drums; 0 = off
  var breakBars: Int
  var chance: Double
  var style: Int            // 0 all drums out, 1 kick and snare out, 2 everything but the kick out
}

struct MidiBedMotionConfig: Decodable {
  var bass: MidiBedMotionRule
  var pad: MidiBedMotionRule
  var drums: MidiBedBreakdown
}

struct MidiBedConfig: Decodable {
  var bpm: Double
  var swing: Double         // 0...1, delays every other 16th
  var midiOut: Bool
  var synthOut: Bool
  var clock: Bool           // send MIDI clock plus Start/Stop while playing
  var drums: [MidiBedDrumConfig]
  var drone: MidiBedDroneConfig
  var harmony: MidiBedHarmonyConfig
  var motion: MidiBedMotionConfig
  var pad: MidiBedPadConfig
  var loops: MidiBedLoopsConfig
  var fade: MidiBedFadeConfig
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

  /// Called on the main queue when a breathing rule changes (or restarts with a scene).
  var onMotion: (([String: Any?]) -> Void)?

  // Control state (queue-only).
  private var config: MidiBedConfig?
  /// A scene switch waiting for the next bar line. While set, further settings
  /// edits update this instead, so the whole new scene lands together.
  private var pendingConfig: MidiBedConfig?
  /// Tick where the pad's chord loop starts counting (0, or the bar a scene switched in).
  private var padStartTick = 0
  private var running = false
  private var tickIndex = 0
  private var nextTickTime: Double = 0
  private var lastWandererTime: Double = 0
  private var lastFadeTime: Double = 0

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
  private var heldPad: [HeldNote] = []
  /// Which chord of the harmony loop we are on.
  private var chordIndex = 0

  // Breathing state: alt = the layer is currently in its alternate state.
  private struct RuleRuntime {
    var alt = false
    var barsLeft = 0
  }
  private var bassRT = RuleRuntime()
  private var padRT = RuleRuntime()
  private var drumRT = RuleRuntime()

  // Fade state: 0...1 per layer. Drone/pad levels go out as CC on their channel
  // (squared, for a more natural volume taper); drum levels scale velocity.
  private var droneLevel = 1.0
  private var padLevel = 1.0
  private var drumLevels: [Double] = []
  private var channelLastCC: [Int: Int] = [:]

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

  /// `queued` (scene switches) waits for the next bar line while playing.
  func applyConfig(json: String, queued: Bool) {
    guard let data = json.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(MidiBedConfig.self, from: data)
    else {
      NSLog("MidiBedEngine: could not decode config")
      return
    }
    queue.async {
      if self.running && (queued || self.pendingConfig != nil) {
        self.pendingConfig = decoded
        return
      }
      self.pendingConfig = nil
      self.install(decoded, atBar: false)
    }
  }

  private func install(_ decoded: MidiBedConfig, atBar: Bool) {
    config = decoded
    synth.enabled = decoded.synthOut
    syncWanderers()
    if running {
      reconcileDrone()
      // At a bar line, processTick starts the new pad chord itself right after
      // this; starting it here too would double-trigger it.
      if !atBar || !decoded.pad.enabled { reconcilePadEnabled() }
      reconcileLoops(decoded)
    }
  }

  func start() {
    // Self-heal the built-in synth if iOS stopped its audio engine (route change).
    DispatchQueue.main.async { self.synth.restartIfNeeded() }
    queue.async {
      guard !self.running else { return }
      self.running = true
      self.tickIndex = 0
      self.padStartTick = 0
      self.chordIndex = 0
      self.pendingConfig = nil
      self.loopsPlaying = false
      self.lastLoopSelect = []
      self.nextTickTime = ProcessInfo.processInfo.systemUptime + 0.05
      self.lastWandererTime = self.nextTickTime
      self.lastFadeTime = self.nextTickTime
      self.channelLastCC.removeAll()
      self.initDrumLevels()
      self.syncWanderers()
      if let c = self.config { self.resetMotion(c) }
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
      // A scene switch that was still waiting for its bar line takes effect now.
      if let p = self.pendingConfig {
        self.pendingConfig = nil
        self.install(p, atBar: false)
      }
      let droneCh = self.config?.drone.channel
      let padCh = self.config?.pad.channel
      self.releaseDrone()
      self.releasePad()
      self.allNotesOff()
      if let cfg = self.config {
        if self.loopsPlaying { self.stopLoops(cfg) }
        if cfg.clock { self.emit(0xFC, 0, 0) } // MIDI Stop
      }
      if let c = droneCh { self.scheduleCCRestore(c) }
      if let c = padCh { self.scheduleCCRestore(c) }
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

  /// A single note for auditioning routing (which channel/note a receiving app
  /// answers to). Works whether or not the transport is running.
  func sendNote(channel: Int, note: Int, velocity: Int, durationMs: Int) {
    queue.async {
      let ch = UInt8(max(0, min(15, channel)))
      let n = UInt8(max(0, min(127, note)))
      let v = UInt8(max(1, min(127, velocity)))
      self.emit(0x90 | ch, n, v)
      let ms = max(20, min(5000, durationMs))
      self.queue.asyncAfter(deadline: .now() + .milliseconds(ms)) { [weak self] in
        self?.emit(0x80 | ch, n, 0)
      }
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
      lastFadeTime = now
    }

    let tickDur = 60.0 / (max(20.0, min(300.0, cfg.bpm)) * Double(ticksPerBeat))
    let barTicks = ticksPerBeat * beatsPerBar
    while nextTickTime <= now {
      // A queued scene switch lands exactly on a bar line, and the pad's chord
      // loop restarts from its first chord there.
      if tickIndex % barTicks == 0, let p = pendingConfig {
        pendingConfig = nil
        // Restart the chord loop first, so installing the new settings starts the
        // drone on chord 1 straight away instead of on the old position.
        chordIndex = 0
        padStartTick = tickIndex
        resetMotion(p)
        install(p, atBar: true)
      }
      guard let current = config else { break }
      processTick(tickIndex, at: nextTickTime, tickDur: tickDur, cfg: current)
      tickIndex += 1
      nextTickTime += tickDur
    }

    let live = config ?? cfg
    updateWanderers(now: now, cfg: live)
    updateFades(now: now, cfg: live)
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

    updateDrumLevels(tickDur: tickDur, cfg: cfg)

    // MIDI clock: 24 pulses per quarter note = every 4th of our 96 ticks, with
    // Start on the very first tick, so a follower locks to our tempo.
    if cfg.clock, tick % 4 == 0 {
      if tick == 0 { pending.append(Pending(time: time, status: 0xFA, d1: 0, d2: 0)) }
      pending.append(Pending(time: time + (tick == 0 ? 0.001 : 0), status: 0xF8, d1: 0, d2: 0))
    }
    if tick == 0 { startLoops(cfg, at: time) }

    // Breathing: at every bar line after the scene's first, step each rule.
    let sceneTick = tick - padStartTick
    if sceneTick > 0, sceneTick % barTicks == 0 { stepMotion(at: time, cfg: cfg) }

    // Harmony: the chord loop changes chord every `barsPerChord` bars (counted from
    // the last scene switch). The pad and a following bass both change then.
    // Common tones are left sounding, never retriggered, so changes glide. Nothing
    // here is rhythmic: these are sustained notes.
    let chordTicks = barTicks * max(1, cfg.harmony.barsPerChord)
    let rel = tick - padStartTick
    if rel >= 0, rel % chordTicks == 0 {
      chordIndex = (rel / chordTicks) % max(1, cfg.harmony.count)
      let padList = activePadChords(cfg)
      if cfg.pad.enabled, !padList.isEmpty {
        playPad(padList[chordIndex % padList.count], pad: cfg.pad, at: time, retrigger: false)
      }
      if cfg.drone.enabled, activeDroneChords(cfg).count > 1, !heldDrone.isEmpty {
        reconcileDrone(keepLevel: true)
      }
    }

    // Drone retrigger (keeps the current fade level, so it does not fade in again).
    if cfg.drone.enabled, cfg.drone.retriggerBars > 0, tick > 0,
      tick % (barTicks * cfg.drone.retriggerBars) == 0
    {
      releaseDrone()
      reconcileDrone(keepLevel: true)
    }

    guard tick % ticksPerStep == 0 else { return }
    let step = tick / ticksPerStep
    let stepDur = tickDur * Double(ticksPerStep)

    // Swing: push every second 16th later, up to half a step.
    let swingDelay = (step % 2 == 1) ? max(0, min(1, cfg.swing)) * stepDur * 0.5 : 0

    for (i, drum) in cfg.drums.enumerated() where drum.enabled || (i < drumLevels.count && drumLevels[i] > 0.001) {
      let steps = max(1, min(64, drum.steps))
      let hits = max(0, min(steps, drum.hits))
      let pos = ((step % steps) - drum.rotation % steps + steps) % steps
      guard euclidHit(position: pos, hits: hits, steps: steps) else { continue }
      if drum.probability < 1, Double.random(in: 0..<1, using: &rng) > drum.probability { continue }

      var vel = Double(drum.velocity)
      if drum.humanize > 0 {
        vel *= 1 - drum.humanize * 0.4 * Double.random(in: 0..<1, using: &rng)
      }
      if i < drumLevels.count { vel *= drumLevels[i] }
      guard vel >= 1 else { continue }
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

  // MARK: Breathing

  private func activeDroneChords(_ cfg: MidiBedConfig) -> [[Int]] {
    bassRT.alt && !cfg.drone.altChords.isEmpty ? cfg.drone.altChords : cfg.drone.chords
  }

  private func activePadChords(_ cfg: MidiBedConfig) -> [[Int]] {
    padRT.alt && !cfg.pad.altChords.isEmpty ? cfg.pad.altChords : cfg.pad.chords
  }

  /// A drum plays if it is switched on and the current breakdown (if one is in
  /// progress) does not silence it.
  private func drumIsOn(_ d: MidiBedDrumConfig, _ cfg: MidiBedConfig) -> Bool {
    guard d.enabled else { return false }
    guard drumRT.alt else { return true }
    switch cfg.motion.drums.style {
    case 1: return !(d.role == "kick" || d.role == "snare")
    case 2: return d.role == "kick"
    default: return false
    }
  }

  /// Must behave exactly like `stepRule` in src/motion.ts (which is unit-tested).
  private func stepRule(_ rt: inout RuleRuntime, baseBars: Int, altBars: Int, chance: Double) -> Bool {
    if baseBars <= 0 {
      let changed = rt.alt
      rt = RuleRuntime(alt: false, barsLeft: 0)
      return changed
    }
    if rt.barsLeft <= 0 { rt.barsLeft = rt.alt ? max(1, altBars) : baseBars }
    rt.barsLeft -= 1
    if rt.barsLeft > 0 { return false }
    var changed = false
    if Double.random(in: 0..<1, using: &rng) * 100 < chance {
      rt.alt.toggle()
      changed = true
    }
    rt.barsLeft = rt.alt ? max(1, altBars) : baseBars
    return changed
  }

  /// A new scene (or Play) starts every rule from its normal state.
  private func resetMotion(_ cfg: MidiBedConfig) {
    bassRT = RuleRuntime(alt: false, barsLeft: max(0, cfg.motion.bass.baseBars))
    padRT = RuleRuntime(alt: false, barsLeft: max(0, cfg.motion.pad.baseBars))
    drumRT = RuleRuntime(alt: false, barsLeft: max(0, cfg.motion.drums.baseBars))
    emitMotion("reset")
  }

  private func emitMotion(_ reason: String) {
    let body: [String: Any?] = ["bass": bassRT.alt, "pad": padRT.alt, "drums": drumRT.alt, "reason": reason]
    let cb = onMotion
    DispatchQueue.main.async { cb?(body) }
  }

  private func stepMotion(at time: Double, cfg: MidiBedConfig) {
    var changed = false
    let m = cfg.motion
    if stepRule(&bassRT, baseBars: m.bass.baseBars, altBars: m.bass.altBars, chance: m.bass.chance) {
      changed = true
      // The bass notes change right now, on the bar line; shared notes keep sounding.
      if cfg.drone.enabled { reconcileDrone(keepLevel: true) }
    }
    if stepRule(&padRT, baseBars: m.pad.baseBars, altBars: m.pad.altBars, chance: m.pad.chance) {
      changed = true
      let list = activePadChords(cfg)
      if cfg.pad.enabled, !list.isEmpty {
        playPad(list[chordIndex % list.count], pad: cfg.pad, at: time, retrigger: false)
      }
    }
    // A drum breakdown needs no note changes: drumIsOn() decides who plays and the
    // drum fade times ease them out and back in.
    if stepRule(&drumRT, baseBars: m.drums.baseBars, altBars: m.drums.breakBars, chance: m.drums.chance) {
      changed = true
      if !drumRT.alt {
        // Coming back from a breakdown: the drums land at FULL strength on this bar
        // line, so the kick hits on the downbeat. Easing them in over the drum fade
        // time would leave that first kick nearly silent. (Going INTO a breakdown
        // still eases out. This runs before this tick's drum step plays.)
        for (i, d) in cfg.drums.enumerated() where i < drumLevels.count && drumIsOn(d, cfg) {
          drumLevels[i] = 1
        }
      }
    }
    if changed { emitMotion("flip") }
  }

  // MARK: Fades

  private func stepLevel(_ level: Double, up: Bool, dt: Double, fadeIn: Double, fadeOut: Double) -> Double {
    if up {
      return fadeIn <= 0 ? 1 : min(1, level + dt / fadeIn)
    }
    return fadeOut <= 0 ? 0 : max(0, level - dt / fadeOut)
  }

  private func initDrumLevels() {
    guard let cfg = config else { return }
    drumLevels = cfg.drums.map { $0.enabled ? (cfg.fade.drumIn > 0 ? 0 : 1) : 0 }
  }

  private func updateDrumLevels(tickDur: Double, cfg: MidiBedConfig) {
    while drumLevels.count < cfg.drums.count {
      drumLevels.append(cfg.drums[drumLevels.count].enabled ? 1 : 0)
    }
    if drumLevels.count > cfg.drums.count {
      drumLevels.removeLast(drumLevels.count - cfg.drums.count)
    }
    for (i, d) in cfg.drums.enumerated() {
      drumLevels[i] = stepLevel(drumLevels[i], up: drumIsOn(d, cfg), dt: tickDur, fadeIn: cfg.fade.drumIn, fadeOut: cfg.fade.drumOut)
    }
  }

  /// Highest fade level among the layers currently sounding on a channel, or
  /// nil if nothing is. Drone and pad can share a channel (one synth); then the
  /// louder of the two wins, so one layer's fade never mutes the other.
  private func channelLevel(_ ch: Int, _ cfg: MidiBedConfig) -> Double? {
    var level: Double?
    if !heldDrone.isEmpty, max(0, min(15, cfg.drone.channel)) == ch { level = max(level ?? 0, droneLevel) }
    if !heldPad.isEmpty, max(0, min(15, cfg.pad.channel)) == ch { level = max(level ?? 0, padLevel) }
    return level
  }

  private func sendChannelLevel(_ rawChannel: Int, force: Bool = false) {
    guard let cfg = config, cfg.fade.cc > 0 else { return }
    let ch = max(0, min(15, rawChannel))
    guard let lvl = channelLevel(ch, cfg) else { return }
    let v = Int((lvl * lvl * 127).rounded())
    if force || channelLastCC[ch] != v {
      channelLastCC[ch] = v
      emit(0xB0 | UInt8(ch), UInt8(max(1, min(127, cfg.fade.cc))), UInt8(max(0, min(127, v))))
    }
  }

  /// After a layer has faded out and released, put the fade CC back to full a
  /// few seconds later (once its release tail is gone) so the synth is not left
  /// silent for anything else you play on it. Skipped if something is sounding.
  private func scheduleCCRestore(_ rawChannel: Int) {
    let ch = max(0, min(15, rawChannel))
    queue.asyncAfter(deadline: .now() + 3.0) { [weak self] in
      guard let self, let cfg = self.config, cfg.fade.cc > 0 else { return }
      if self.channelLevel(ch, cfg) == nil {
        self.channelLastCC[ch] = 127
        self.emit(0xB0 | UInt8(ch), UInt8(max(1, min(127, cfg.fade.cc))), 127)
      }
    }
  }

  private func updateFades(now: Double, cfg: MidiBedConfig) {
    let dt = now - lastFadeTime
    guard dt >= 0.02 else { return }
    lastFadeTime = now

    guard cfg.fade.cc > 0 else {
      // CC fades were switched off while something was mid-fade: finish cleanly.
      if !cfg.drone.enabled, !heldDrone.isEmpty { releaseDrone() }
      if !cfg.pad.enabled, !heldPad.isEmpty { releasePad() }
      return
    }

    if !heldDrone.isEmpty {
      let up = cfg.drone.enabled
      droneLevel = stepLevel(droneLevel, up: up, dt: dt, fadeIn: cfg.fade.droneIn, fadeOut: cfg.fade.droneOut)
      sendChannelLevel(cfg.drone.channel)
      if !up, droneLevel <= 0.001 {
        releaseDrone()
        droneLevel = 0
        scheduleCCRestore(cfg.drone.channel)
      }
    }
    if !heldPad.isEmpty {
      let up = cfg.pad.enabled
      padLevel = stepLevel(padLevel, up: up, dt: dt, fadeIn: cfg.fade.padIn, fadeOut: cfg.fade.padOut)
      sendChannelLevel(cfg.pad.channel)
      if !up, padLevel <= 0.001 {
        releasePad()
        padLevel = 0
        scheduleCCRestore(cfg.pad.channel)
      }
    }
  }

  // MARK: Drone

  private func reconcileDrone(keepLevel: Bool = false) {
    guard let cfg = config else { return }
    let d = cfg.drone
    let ch = max(0, min(15, d.channel))

    guard d.enabled, running else {
      // Switched off. With a fade-out and CC fading on, the notes stay held and
      // updateFades ramps them down, then releases. Otherwise stop right away.
      if !running || cfg.fade.cc <= 0 || cfg.fade.droneOut <= 0 {
        releaseDrone()
        droneLevel = 0
      }
      return
    }

    let list = activeDroneChords(cfg)
    let notes = list.isEmpty ? [] : list[chordIndex % list.count]
    let wanted = notes.map { HeldNote(channel: ch, note: max(0, min(127, $0))) }
    let vel = UInt8(max(1, min(127, d.velocity)))
    let startingFromSilence = heldDrone.isEmpty
    let toRelease = heldDrone.filter { !wanted.contains($0) }
    let toStart = wanted.filter { !heldDrone.contains($0) }

    heldDrone = wanted
    if startingFromSilence && !keepLevel {
      droneLevel = (cfg.fade.cc > 0 && cfg.fade.droneIn > 0) ? 0 : 1
    }
    // Set the starting volume BEFORE the notes so they never blip at the old level.
    if startingFromSilence { sendChannelLevel(ch, force: true) }

    for held in toRelease {
      emit(0x80 | UInt8(held.channel), UInt8(held.note), 0)
    }
    for note in toStart {
      emit(0x90 | UInt8(note.channel), UInt8(note.note), vel)
    }
  }

  private func releaseDrone() {
    for held in heldDrone {
      emit(0x80 | UInt8(held.channel), UInt8(held.note), 0)
    }
    heldDrone = []
  }

  // MARK: Loops (start/stop + choose, no notes)

  private var loopsPlaying = false
  private var lastLoopSelect: [Int] = []

  private func loopSelectKey(_ l: MidiBedLoopsConfig) -> [Int] {
    [l.channel, l.program, l.bankMSB, l.bankLSB]
  }

  /// Bank Select (if set) then Program Change, in order, a couple of ms apart.
  private func sendLoopSelect(_ l: MidiBedLoopsConfig, at time: Double) {
    let ch = UInt8(max(0, min(15, l.channel)))
    var t = time
    if l.bankMSB >= 0 {
      pending.append(Pending(time: t, status: 0xB0 | ch, d1: 0, d2: UInt8(min(127, l.bankMSB))))
      t += 0.002
    }
    if l.bankLSB >= 0 {
      pending.append(Pending(time: t, status: 0xB0 | ch, d1: 32, d2: UInt8(min(127, l.bankLSB))))
      t += 0.002
    }
    pending.append(Pending(time: t, status: 0xC0 | ch, d1: UInt8(max(0, min(127, l.program))), d2: 0))
    lastLoopSelect = loopSelectKey(l)
  }

  private func startLoops(_ cfg: MidiBedConfig, at time: Double) {
    let l = cfg.loops
    guard l.enabled else { return }
    sendLoopSelect(l, at: time)
    if l.startCC > 0 {
      // Give the loop selection time to land before telling it to play.
      pending.append(Pending(time: time + 0.05, status: 0xB0 | UInt8(max(0, min(15, l.channel))), d1: UInt8(min(127, l.startCC)), d2: 127))
    }
    loopsPlaying = true
  }

  private func stopLoops(_ cfg: MidiBedConfig) {
    let l = cfg.loops
    let cc = l.stopCC > 0 ? l.stopCC : l.startCC
    if cc > 0 { emit(0xB0 | UInt8(max(0, min(15, l.channel))), UInt8(min(127, cc)), 127) }
    loopsPlaying = false
  }

  /// Settings changed while playing: start or stop the loops, or switch to a
  /// different loop. (Scene changes arrive here on a bar line.)
  private func reconcileLoops(_ cfg: MidiBedConfig) {
    let l = cfg.loops
    let now = ProcessInfo.processInfo.systemUptime
    if l.enabled && !loopsPlaying {
      startLoops(cfg, at: now)
    } else if !l.enabled && loopsPlaying {
      stopLoops(cfg)
    } else if l.enabled && loopsPlaying && loopSelectKey(l) != lastLoopSelect {
      sendLoopSelect(l, at: now)
    }
  }

  // MARK: Chord pad

  private func playPad(_ notes: [Int], pad: MidiBedPadConfig, at time: Double, retrigger: Bool) {
    let ch = max(0, min(15, pad.channel))
    let wanted = notes.map { HeldNote(channel: ch, note: max(0, min(127, $0))) }
    let startingFromSilence = heldPad.isEmpty
    let toRelease = heldPad.filter { retrigger || !wanted.contains($0) }
    var toStart = wanted.filter { retrigger || !heldPad.contains($0) }
    toStart.sort { $0.note < $1.note }

    heldPad = wanted
    if startingFromSilence, let cfg = config {
      padLevel = (cfg.fade.cc > 0 && cfg.fade.padIn > 0) ? 0 : 1
      sendChannelLevel(ch, force: true)
    }

    for h in toRelease {
      pending.append(Pending(time: time, status: 0x80 | UInt8(h.channel), d1: UInt8(h.note), d2: 0))
    }
    let strum = max(0, pad.strumMs) / 1000
    for (i, n) in toStart.enumerated() {
      var vel = Double(pad.velocity)
      if pad.humanize > 0 {
        vel *= 1 - pad.humanize * 0.3 * Double.random(in: 0..<1, using: &rng)
      }
      let v = UInt8(max(1, min(127, Int(vel))))
      // +3 ms keeps a retriggered note's off ahead of its on.
      pending.append(Pending(time: time + 0.003 + Double(i) * strum, status: 0x90 | UInt8(n.channel), d1: UInt8(n.note), d2: v))
    }
  }

  private func releasePad() {
    // Cancel strummed note-ons that haven't fired yet, so nothing hangs.
    pending.removeAll { p in
      (p.status & 0xF0) == 0x90 && heldPad.contains { UInt8($0.channel) == (p.status & 0x0F) && UInt8($0.note) == p.d1 }
    }
    for held in heldPad {
      emit(0x80 | UInt8(held.channel), UInt8(held.note), 0)
    }
    heldPad = []
  }

  /// Handles the Pad switch being toggled while playing.
  private func reconcilePadEnabled() {
    guard let cfg = config else { return }
    if !cfg.pad.enabled {
      // With a fade-out and CC fading on, updateFades ramps down then releases.
      if cfg.fade.cc <= 0 || cfg.fade.padOut <= 0 {
        releasePad()
        padLevel = 0
      }
    } else if heldPad.isEmpty, !activePadChords(cfg).isEmpty {
      let list = activePadChords(cfg)
      playPad(list[chordIndex % list.count], pad: cfg.pad, at: ProcessInfo.processInfo.systemUptime, retrigger: false)
    }
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
    // System messages (clock, start, stop) are for other apps only.
    if status >= 0xF0 {
      if config?.midiOut ?? true { sendMIDI(status, d1, d2) }
      return
    }
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
    let bytes: [UInt8]
    if status >= 0xF8 {
      bytes = [status] // real-time messages (clock, start, stop) are a single byte
    } else if (status & 0xF0) == 0xC0 || (status & 0xF0) == 0xD0 {
      bytes = [status, d1]
    } else {
      bytes = [status, d1, d2]
    }
    _ = MIDIPacketListAdd(&packetList, MemoryLayout<MIDIPacketList>.size, packet, 0, bytes.count, bytes)
    MIDIReceived(source, &packetList)
  }
}
