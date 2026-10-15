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
  var ghostHits: Int        // a second, quiet Euclidean layer on the free steps (0 = none)
  var ghostRotation: Int
  var ghostVelocity: Int
  var accentEvery: Int      // every Nth hit of the main pattern is louder (0 = off)
  var accentBoost: Double   // 0...1 extra velocity for accents
  var keepFirst: Bool       // the pattern's first hit ignores the chance
  var looseMs: Double       // each hit up to this many ms late, at random
}

/// An orchestrated stop: where it lands and how it sounds.
struct MidiBedEndRequest: Decodable {
  var style: Int            // 1 end of this bar, 2 end of the progression, 3 end of the scene
  var fadeBars: Int         // 0 = cut on the bar line (notes and reverb ring out), 1 or 2 = fade over the last bars
  var finalHit: Bool        // a kick on the last downbeat
  var noise: Bool           // a transition noise on the last downbeat
  var noiseShape: Int
  var noiseLevel: Double
}

/// One lane of the loop player: which file, how many bars it spans, its level and balance, and whether it plays.
struct MidiBedLaneConfig: Decodable {
  var path: String
  var bars: Int
  var repeats: Int          // a loop shorter than a bar plays this many times in it
  var level: Double
  var pan: Double
  var on: Bool
}

/// Patterns that change by themselves (kick excluded).
struct MidiBedEvolveConfig: Decodable {
  var everyBars: Int        // 0 = off
  var chance: Double        // 0...1 per drum per interval
  var returnAfter: Int      // changes before a drum goes back to its own pattern
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
  var cycleBars: Double     // bars for one full cycle; also how fast free wandering crosses the range
  var looseness: Double     // 0 = a clean cycle ... 1 = free wandering
  var phase: Double         // 0...1, where in its cycle it starts
  var smoothBeats: Double   // beats of easing
  var opposes: Int          // -1 = none, else the index of the filter this one moves against
  var opposeAmount: Double  // 0...1
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
  var ownPort: Bool         // send the loop choice, start/stop and the clock out a second source, "MidiBed Loops"
}

/// "Breathing": a layer stays in its normal state for baseBars, then (with
/// probability chance, percent) flips to its alternate for altBars, and so on,
/// counted in bars from the start of the scene. baseBars 0 = off.
struct MidiBedMotionRule: Decodable {
  var baseBars: Int
  var altBars: Int
  var chance: Double
  var kind: Int             // 0 = the layer's other version (follow/steady, or steady fifths), 1 = drop out completely
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

/// A transition sound: shape 0 Wave, 1 Wind, 2 Thunder, 3 Boom, 4 Crash; colour 0 white,
/// 1 pink, 2 brown. Wave and Wind are LEAD-INS (they rise into the bar line over
/// `beats`); the others play ON the bar line.
struct MidiBedTransitionSlot: Decodable {
  var on: Bool
  var shape: Int
  var color: Int
  var beats: Double
  var level: Double         // 0...1
}

/// A sound that comes round now and then inside a scene (every N bars, or at the end of each
/// chord loop), with a chance, and optionally varying its shape and colour.
struct MidiBedRecurring: Decodable {
  var on: Bool
  var when: Int             // 0 every `everyBars` bars, 1 end of each chord loop
  var everyBars: Int
  var chance: Double        // percent
  var vary: Int             // 0 the same shape each time, 1 random from shapeMask, 2 shapeMask in turn
  var shape: Int
  var shapeMask: Int        // bit 0 = Wave ... bit 4 = Crash
  var colorMode: Int        // 0 the chosen colour, 1 a random colour each time
  var color: Int
  var beats: Double
  var level: Double         // 0...1
}

struct MidiBedTransitionConfig: Decodable {
  var minLeadBeats: Double  // a lead-in needs at least this long before the bar line, else its "downer" plays on the bar
  var entrance: MidiBedTransitionSlot   // when a scene starts
  var drumBreak: MidiBedTransitionSlot  // as the drums drop out in a breakdown
  var drumReturn: MidiBedTransitionSlot // as the drums come back from a breakdown
  var recurring: MidiBedRecurring
}

/// Auto-advance: after `bars` bars (0 = never) the scene moves on by itself. mode 1 next scene,
/// 2 a chosen scene (`target`), 3 a random other scene.
struct MidiBedAdvance: Decodable {
  var mode: Int
  var bars: Int
  var target: Int
}

/// MidiDancer: a pool of phrases built on the JS side (src/dancer.ts). A phrase is `span` complete
/// bars and events [step in 16ths from the bar line it starts on, length in steps, note, velocity].
/// The engine plays one (a call), then stays quiet for span x spaceMult bars (the response space).
struct MidiBedDancerPhrase: Decodable {
  var span: Int
  var events: [[Int]]
}

struct MidiBedDancerConfig: Decodable {
  var enabled: Bool
  var channel: Int
  var mode: Int             // 0 call and response, 1 solo (plays by itself)
  var spaceMult: Int
  var restBars: Int         // solo: whole bars of rest between phrases
  var carryOn: Bool         // solo: carry on through a scene change
  var legato: Int           // 0...100: how much consecutive notes are joined
  var vibratoCents: Double  // 0 = off
  var vibratoHz: Double
  var vibratoDelay: Double  // seconds after a note starts
  var vibratoMode: Int      // 0 pitch bend, 1 mod wheel (CC 1)
  var bendRange: Int        // semitones the receiving sound bends for a full pitch bend
  var bendChance: Double    // 0...1: share of notes that get a scoop and/or a fall
  var scoopCents: Double    // start this far below and slide up (0 = none)
  var scoopSec: Double
  var fallCents: Double     // drop this far over the end of a phrase's last note (0 = none)
  var fallSec: Double
  var dipCents: Double      // sag on occasional long notes (0 = none)
  var dipChance: Double     // 0...1 of the long notes
  var dipSec: Double        // each way
  var pick: Int             // 0 in turn, 1 at random, 2 the same one every time, 3 back and forth
  var phrases: [MidiBedDancerPhrase]
}

/// One drum a fill can use: its note and channel, a role (0 snare, 1 high tom, 2 mid tom, 3 low tom) and base velocity.
struct MidiBedFillVoice: Decodable {
  var note: Int
  var channel: Int
  var role: Int
  var velocity: Int
}

/// Drum fills (the reference is src/fill.ts): when to play one, how full, and which drums take part.
struct MidiBedFillConfig: Decodable {
  var enabled: Bool
  var everyBars: Int        // 0 = not on a count
  var beforeScene: Bool
  var afterBreakdown: Bool
  var density: Double       // 0...1
  var chance: Double        // 0...1
  var maxBeats: Int         // 1 or 2
  var palette: [MidiBedFillVoice]
}

/// Where one part's sound goes: out as MIDI to other apps, and/or into MidiBed's own built-in sound.
struct MidiBedPartOutput: Decodable {
  var midi: Bool
  var synth: Bool
}

struct MidiBedOutputsConfig: Decodable {
  var bass: MidiBedPartOutput
  var pad: MidiBedPartOutput
  var dancer: MidiBedPartOutput
  var drums: MidiBedPartOutput
  var loops: MidiBedPartOutput
}

/// Which parts have their own MIDI source ("MidiBed Bass", "MidiBed Pad", "MidiBed Dancer", "MidiBed Drums").
/// A part without one goes out the main "MidiBed" source. Messages are routed by MIDI channel.
struct MidiBedPortsConfig: Decodable {
  var bass: Bool
  var pad: Bool
  var dancer: Bool
  var drums: Bool
}

struct MidiBedConfig: Decodable {
  var bpm: Double
  var swing: Double         // 0...1, delays every other 16th
  var midiOut: Bool
  var synthOut: Bool
  var clock: Bool           // send MIDI clock while playing
  var clockTransport: Bool  // ...and also MIDI Start at the beginning and Stop at the end
  var clockAlways: Bool     // keep sending the clock while stopped, so a follower stays locked
  var sceneIndex: Int       // which scene this configuration is
  var frozen: Bool          // stop the bed changing by itself (breathing, recurring sound, auto-advance)
  var filterHold: Bool      // hold the filter wanderers where they are
  var sceneChangeAt: Int    // when a queued scene change lands: 0 next bar, 1 end of the progression, 2 end of the scene
  var advance: MidiBedAdvance
  var drums: [MidiBedDrumConfig]
  var drone: MidiBedDroneConfig
  var harmony: MidiBedHarmonyConfig
  var dancer: MidiBedDancerConfig
  var fill: MidiBedFillConfig
  var ports: MidiBedPortsConfig
  var outputs: MidiBedOutputsConfig
  var evolve: MidiBedEvolveConfig
  var lanes: [MidiBedLaneConfig]
  var motion: MidiBedMotionConfig
  var transitions: MidiBedTransitionConfig
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
  /// Extra virtual sources, indexed by port number: 1 loops, 2 bass, 3 pad, 4 dancer, 5 drums (0 is `source`).
  private var portSources = [MIDIEndpointRef](repeating: MIDIEndpointRef(), count: 6)
  /// For each MIDI channel, which ports its messages go out (rebuilt whenever the settings change).
  private var channelPorts: [[Int]] = Array(repeating: [0], count: 16)
  /// For each MIDI channel: may its messages go out as MIDI, and may they play the built-in sound? (Per part, see
  /// MidiBedOutputsConfig; a channel nobody uses is open, and a channel shared by parts is open if any of them is.)
  private var channelMidi = [Bool](repeating: true, count: 16)
  private var channelSynth = [Bool](repeating: true, count: 16)
  let synth = MidiBedTestSynth()

  /// Called on the main queue once per beat with (bar, beat), both 1-based.
  var onBeat: ((Int, Int) -> Void)?

  /// Called on the main queue when a breathing rule changes (or restarts with a scene).
  var onMotion: (([String: Any?]) -> Void)?

  /// Called on the main queue for each MIDI message from a controller (a pedal, a keyboard): note on,
  /// control change, program change. {kind: cc|note|pc, channel 0-15, number, value}.
  var onMidiIn: (([String: Any?]) -> Void)?
  private var inputPort = MIDIPortRef()
  private var inputDestination = MIDIEndpointRef()
  private var lastControlTime: [Int: Double] = [:]

  /// Called on the main queue when an orchestrated stop is set (bars left) and every bar line after,
  /// and once more (onEnded) when the engine has stopped by itself at the end.
  var onEnding: (([String: Any?]) -> Void)?
  var onEnded: (() -> Void)?

  /// Called on the main queue every bar line (how long is left in this scene) and when the engine
  /// moved to another scene by itself.
  var onScene: (([String: Any?]) -> Void)?

  // Control state (queue-only).
  private var config: MidiBedConfig?
  /// A scene switch waiting for the next bar line. While set, further settings
  /// edits update this instead, so the whole new scene lands together.
  private var pendingConfig: MidiBedConfig?
  /// The bar line (absolute tick) the waiting scene switch lands on.
  private var pendingLandTick = 0
  /// The pending switch was started by auto-advance (not by the player).
  private var pendingIsAuto = false
  /// Every scene as a full configuration, so the engine can move between them by itself.
  private var sceneConfigs: [MidiBedConfig] = []
  private var advanceBarsLeft = 0
  private var advanceTarget = -1
  private var advanceEntranceScheduled = false
  /// Tick where the pad's chord loop starts counting (0, or the bar a scene switched in).
  private var padStartTick = 0
  private var running = false
  /// The clock while stopped (see updateIdleClock): its own timer, and the time of its next pulse.
  private var idleTimer: DispatchSourceTimer?
  private var idleNextPulse: Double = 0
  private var tickIndex = 0
  private var nextTickTime: Double = 0
  private var lastWandererTime: Double = 0
  private var lastFadeTime: Double = 0

  private struct Pending {
    var time: Double
    var status: UInt8
    var d1: UInt8
    var d2: UInt8
    var port: Int = 0 // 1 = the loops app's own MIDI source (when the loops use their own port)
  }
  private var pending: [Pending] = []

  private struct PendingLoop {
    var time: Double
    var lane: Int
    var start: Bool
    var seconds: Double
    var repeats: Int = 1
  }
  private var pendingLoop: [PendingLoop] = []

  private struct PendingNoise {
    var time: Double
    var tag: Int // 0 scene entrance, 1 drum return, 2 drum break, 3 recurring
    var shape: Int
    var color: Int
    var pre: Double
    var post: Double
    var offset: Double
    var level: Double
  }
  private var pendingNoise: [PendingNoise] = []

  // The recurring sound: the bar (counted from the scene start) of the next boundary, whether
  // that boundary gets a sound, which, and whether it has been scheduled yet.
  private var recurBoundary = 0
  private var recurPlay = false
  private var recurShape = 0
  private var recurColor = 0
  private var recurScheduled = true
  private var recurTurn = 0

  // Drum fills: the normal pattern is silent from fillStartTick up to (not including) fillEndTick.
  private var fillStartTick = 0
  // Loop player: which lanes the engine has started, and the tick each one started on.
  private var laneActive = [Bool](repeating: false, count: LoopPlayer.laneCount)
  private var laneStart = [Int](repeating: 0, count: LoopPlayer.laneCount)
  private var lanePath = [String](repeating: "", count: LoopPlayer.laneCount)
  // Orchestrated stop: the bar line (absolute tick) the music ends on, its plan, and the fade factor.
  private var endTick = -1
  private var endPlan: MidiBedEndRequest?
  private var endFade = 1.0
  private var ended = false
  // Evolving patterns: per drum, how far the hit count and rotation have been nudged, and how many nudges so far.
  private var evoHits: [Int] = []
  private var evoRot: [Int] = []
  private var evoCount: [Int] = []
  private var fillEndTick = 0
  private var fillRequested = false

  // MidiDancer: bars left until the next call, and which phrase is next when going in turn.
  private var dancerWait = 0
  private var dancerTurn = 0

  private struct HeldNote: Equatable {
    var channel: Int
    var note: Int
  }
  private var heldDrone: [HeldNote] = []
  /// Every note that has been started and not yet ended (channel << 8 | note), so Stop and Panic can end
  /// exactly those, even if their note-offs were still waiting to be sent.
  private var sounding = Set<Int>()
  private var heldPad: [HeldNote] = []
  /// Which chord of the harmony loop we are on.
  private var chordIndex = 0

  // Breathing state: alt = the layer is currently in its alternate state.
  private struct RuleRuntime {
    var alt = false
    var barsLeft = 0
    /// A chance roll decided one bar early (the drums' return), so a lead-in can play into it.
    var roll: Double? = nil
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
  /// When the filter hold began (the clean cycle is shifted by the held time on release, so nothing jumps).
  private var holdSince: Double?
  /// When the current scene began (a scene switch's bar line, or Play): the filters' cycles count from here.
  private var sceneStartTime: Double = 0

  private var rng = SystemRandomNumberGenerator()

  init() {
    // The notification block rescans the sources whenever one appears (a Bluetooth pedal connecting).
    MIDIClientCreateWithBlock("MidiBed" as CFString, &client) { [weak self] _ in
      self?.connectInputs()
    }
    // MIDISourceCreate is deprecated on iOS 14+ in favour of the protocol-based
    // variant but still works and is what every receiving app understands.
    MIDISourceCreate(client, "MidiBed" as CFString, &source)
    portSources[0] = source
    for (i, name) in [(1, "MidiBed Loops"), (2, "MidiBed Bass"), (3, "MidiBed Pad"), (4, "MidiBed Dancer"), (5, "MidiBed Drums")] {
      var endpoint = MIDIEndpointRef()
      MIDISourceCreate(client, name as CFString, &endpoint)
      portSources[i] = endpoint
    }
    // Input: listen to every other MIDI source (pedals, keyboards), and offer a destination other apps
    // (or AUM) can send to.
    MIDIInputPortCreateWithBlock(client, "MidiBed Input" as CFString, &inputPort) { [weak self] list, _ in
      self?.handleIncoming(list)
    }
    MIDIDestinationCreateWithBlock(client, "MidiBed In" as CFString, &inputDestination) { [weak self] list, _ in
      self?.handleIncoming(list)
    }
    connectInputs()
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
        if queued { self.pendingIsAuto = false }
        if queued {
          // A scene switch was just requested: it lands on the next bar line, or later (the end of the
          // progression, the end of the scene), and its entrance sound is timed to that bar line. A newer
          // request replaces an older one that has not started yet.
          self.pendingNoise.removeAll { $0.tag == 0 }
          if let cur = self.config {
            self.pendingLandTick = self.landingTick(cur)
            self.scheduleTransition(decoded.transitions.entrance, tag: 0, barTime: self.timeOfTick(self.pendingLandTick, cur), cfg: decoded)
          }
        }
        return
      }
      self.pendingConfig = nil
      self.install(decoded, atBar: false)
    }
  }

  /// Work out, per MIDI channel, which sources carry it: a part with its own port uses that source,
  /// everything else the main one. (If two parts share a channel they may both apply.)
  private func rebuildChannelPorts(_ c: MidiBedConfig) {
    var map = [[Int]](repeating: [], count: 16)
    var used = [Bool](repeating: false, count: 16)
    var midi = [Bool](repeating: false, count: 16)
    var synthOn = [Bool](repeating: false, count: 16)
    func add(_ channel: Int, _ own: Bool, _ port: Int, _ out: MidiBedPartOutput) {
      let ch = max(0, min(15, channel))
      let p = own ? port : 0
      if !map[ch].contains(p) { map[ch].append(p) }
      used[ch] = true
      if out.midi { midi[ch] = true }
      if out.synth { synthOn[ch] = true }
    }
    add(c.drone.channel, c.ports.bass, 2, c.outputs.bass)
    add(c.pad.channel, c.ports.pad, 3, c.outputs.pad)
    add(c.dancer.channel, c.ports.dancer, 4, c.outputs.dancer)
    for d in c.drums { add(d.channel, c.ports.drums, 5, c.outputs.drums) }
    channelPorts = map.map { $0.isEmpty ? [0] : $0 }
    channelMidi = (0..<16).map { used[$0] ? midi[$0] : true }
    channelSynth = (0..<16).map { used[$0] ? synthOn[$0] : true }
  }

  private func install(_ decoded: MidiBedConfig, atBar: Bool) {
    config = decoded
    synth.enabled = decoded.synthOut
    syncWanderers()
    rebuildChannelPorts(decoded)
    synth.bassChannel = decoded.drone.channel
    synth.setPartChannels(bass: decoded.drone.channel, pad: decoded.pad.channel, dancer: decoded.dancer.channel)
    applyLanes(decoded)
    updateIdleClock()
    if running {
      reconcileDrone()
      // At a bar line, processTick starts the new pad chord itself right after
      // this; starting it here too would double-trigger it.
      if !atBar || !padOn(decoded) { reconcilePadEnabled() }
      reconcileLoops(decoded)
    }
  }

  /// Connect the input port to every MIDI source except MidiBed's own (so it never hears itself).
  private func connectInputs() {
    guard inputPort != 0 else { return }
    let count = MIDIGetNumberOfSources()
    for i in 0..<count {
      let src = MIDIGetSource(i)
      if src == 0 || portSources.contains(src) { continue }
      MIDIPortConnectSource(inputPort, src, nil)
    }
  }

  /// Parse the MIDI packets of a controller and report presses to JS.
  private func handleIncoming(_ list: UnsafePointer<MIDIPacketList>) {
    var packet = list.pointee.packet
    for _ in 0..<Int(list.pointee.numPackets) {
      let len = min(Int(packet.length), 256)
      withUnsafeBytes(of: packet.data) { raw in
        var i = 0
        while i < len {
          let status = raw[i]
          if status >= 0xF8 { i += 1; continue }   // real-time (clock etc.)
          if status >= 0xF0 { break }              // system exclusive and friends: skip the rest
          if status < 0x80 { i += 1; continue }    // stray data byte
          let kind = status & 0xF0
          let need = (kind == 0xC0 || kind == 0xD0) ? 1 : 2
          if i + need >= len { break }
          let d1 = Int(raw[i + 1])
          let d2 = need == 2 ? Int(raw[i + 2]) : 0
          report(status: status, d1: d1, d2: d2)
          i += 1 + need
        }
      }
      packet = MIDIPacketNext(&packet).pointee
    }
  }

  private func report(status: UInt8, d1: Int, d2: Int) {
    let kind = status & 0xF0
    let channel = Int(status & 0x0F)
    var name: String
    switch kind {
    case 0x90 where d2 > 0: name = "note"
    case 0x80, 0x90: name = "note"   // a note off (or a note on with velocity 0): the release of a button
    case 0xB0: name = "cc"
    case 0xC0: name = "pc"
    default: return
    }
    // A knob or an expression pedal sends a flood of control changes: let only the ends and a few
    // in between through, so the bridge to JS is never swamped.
    if name == "cc", d2 != 0, d2 != 127 {
      let key = (channel << 8) | d1
      let now = ProcessInfo.processInfo.systemUptime
      if let last = lastControlTime[key], now - last < 0.04 { return }
      lastControlTime[key] = now
    }
    let released = name == "note" && (kind == 0x80 || d2 == 0)
    let body: [String: Any?] = ["kind": name, "channel": channel, "number": d1, "value": name == "pc" ? 127 : (released ? 0 : d2)]
    let cb = onMidiIn
    DispatchQueue.main.async { cb?(body) }
  }

  /// The built-in drum sounds: type and settings for each drum, looked up by note. Kept out of the main
  /// configuration so editing a knob never re-queues a scene.
  func setDrumVoices(json: String) {
    struct DrumVoiceConfig: Decodable {
      var note: Int
      var channel: Int
      var type: Int
      var tune: Double
      var decay: Double
      var tone: Double
      var snap: Double
      var level: Double
    }
    guard let data = json.data(using: .utf8), let list = try? JSONDecoder().decode([DrumVoiceConfig].self, from: data) else {
      NSLog("MidiBedEngine: could not decode drum voices")
      return
    }
    queue.async {
      self.synth.configureDrums(
        list.map { (note: $0.note, kind: $0.type, tune: Float($0.tune), decay: Float($0.decay), tone: Float($0.tone), snap: Float($0.snap), level: Float($0.level)) })
    }
  }

  /// The built-in bass voice: whether it is on, whether the built-in sound plays only it, and its settings.
  /// Kept out of the main configuration so editing a knob never re-queues a scene.
  func setBassVoice(json: String) {
    struct BassVoiceConfig: Decodable {
      var enabled: Bool
      var exclusive: Bool
      var values: [Double]
    }
    guard let data = json.data(using: .utf8), let c = try? JSONDecoder().decode(BassVoiceConfig.self, from: data) else {
      NSLog("MidiBedEngine: could not decode bass voice")
      return
    }
    queue.async {
      if let ch = self.config?.drone.channel { self.synth.bassChannel = ch }
      self.synth.configureBass(on: c.enabled, exclusive: c.exclusive, values: c.values.map { Float($0) })
    }
  }

  /// Filter presets for the built-in sound: per part (bass, pad, MidiDancer, drums) a mode (0 none, 1 low-pass,
  /// 2 high-pass, 3 band-pass), a frequency and a resonance, and the glide time. Kept out of the main
  /// configuration so changing a preset never re-queues a scene.
  func setFilter(json: String) {
    struct FilterPart: Decodable { var mode: Int; var hz: Double; var res: Double }
    struct FilterConfig: Decodable { var glide: Double; var parts: [FilterPart] }
    guard let data = json.data(using: .utf8), let c = try? JSONDecoder().decode(FilterConfig.self, from: data) else {
      NSLog("MidiBedEngine: could not decode filter")
      return
    }
    queue.async {
      self.synth.setFilterTargets(
        glide: Float(c.glide),
        parts: c.parts.map { (mode: $0.mode, hz: Float($0.hz), res: Float($0.res)) })
    }
  }

  /// The built-in effects (UglyFX): the settings as one list of numbers in `UglyFXParam` order.
  /// Kept out of the main configuration so editing a knob never re-queues a scene.
  func setFX(json: String) {
    struct FXConfig: Decodable { var values: [Double] }
    guard let data = json.data(using: .utf8), let c = try? JSONDecoder().decode(FXConfig.self, from: data) else {
      NSLog("MidiBedEngine: could not decode effects")
      return
    }
    queue.async {
      for i in 0..<min(c.values.count, UglyFXParam.count) { self.synth.fx.params[i] = Float(c.values[i]) }
    }
  }

  /// All scenes as full configurations (a JSON array), for auto-advance.
  func setScenes(json: String) {
    guard let data = json.data(using: .utf8),
      let decoded = try? JSONDecoder().decode([MidiBedConfig].self, from: data)
    else {
      NSLog("MidiBedEngine: could not decode scenes")
      return
    }
    queue.async { self.sceneConfigs = decoded }
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
      let startNow = ProcessInfo.processInfo.systemUptime
      self.nextTickTime = startNow + 0.05
      // The clock was already running while stopped: start on its next pulse, so the pulses carry on
      // at the same steady spacing and the follower stays locked (no gap, no hiccup).
      if self.idleTimer != nil, let c = self.config {
        let interval = 60.0 / (max(20.0, min(300.0, c.bpm)) * 24.0)
        var t = self.idleNextPulse
        while t < startNow + 0.02 { t += interval }
        self.nextTickTime = t
      }
      self.updateIdleClock()
      self.lastWandererTime = self.nextTickTime
      self.sceneStartTime = self.nextTickTime
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
    queue.async { self.stopOnQueue(soft: false) }
  }

  /// `soft`: the end of an orchestrated stop. Notes are released one by one and all-notes-off is sent, but
  /// NOT all-sound-off (CC 120), so a synth lets its release and reverb ring out.
  private func stopOnQueue(soft: Bool) {
    do {
      guard self.running else { return }
      self.endTick = -1
      self.endPlan = nil
      self.endFade = 1
      self.ended = false
      self.running = false
      self.pendingLoop.removeAll()
      self.synth.loops.stopAll(fade: soft ? 0.25 : 0.03)
      for i in 0..<LoopPlayer.laneCount { self.laneActive[i] = false }
      self.timer?.cancel()
      self.timer = nil
      // Hand the clock back to the idle timer on the next pulse boundary (every 4th tick).
      if let c = self.config {
        let tickDur = 60.0 / (max(20.0, min(300.0, c.bpm)) * Double(self.ticksPerBeat))
        self.idleNextPulse = self.nextTickTime + Double((4 - self.tickIndex % 4) % 4) * tickDur
      }
      self.pending.removeAll()
      self.pendingNoise.removeAll()
      self.pendingIsAuto = false
      self.fillStartTick = 0
      self.fillEndTick = 0
      self.fillRequested = false
      self.advanceBarsLeft = 0
      self.advanceTarget = -1
      // A scene switch that was still waiting for its bar line takes effect now.
      if let p = self.pendingConfig {
        self.pendingConfig = nil
        self.install(p, atBar: false)
      }
      let droneCh = self.config?.drone.channel
      let padCh = self.config?.pad.channel
      self.releaseDrone()
      self.releasePad()
      self.silence(soft: soft)
      if let cfg = self.config {
        if self.loopsPlaying { self.stopLoops(cfg) }
        if cfg.clock && cfg.clockTransport { self.emit(0xFC, 0, 0) } // MIDI Stop
      }
      if let c = droneCh { self.scheduleCCRestore(c) }
      if let c = padCh { self.scheduleCCRestore(c) }
      self.updateIdleClock()
    }
  }

  /// One-off control change, usable whether or not the transport is running
  /// (MIDI-learn sweeps, manual nudges).
  func sendControlChange(channel: Int, cc: Int, value: Int, loops: Bool) {
    queue.async {
      self.emit(0xB0 | UInt8(max(0, min(15, channel))), UInt8(max(0, min(127, cc))), UInt8(max(0, min(127, value))), port: loops ? 1 : 0)
    }
  }

  /// Optional Bank Select (CC 0 / CC 32; pass a negative number to skip) then
  /// Program Change, so the receiving app switches sound.
  func sendProgramChange(channel: Int, program: Int, bankMSB: Int, bankLSB: Int, loops: Bool) {
    queue.async {
      let ch = UInt8(max(0, min(15, channel)))
      let port = loops ? 1 : 0
      // Spaced out a little: some apps load a preset on another thread, and a Program Change that
      // arrives in the same instant as its Bank Select can be lost or applied to the old bank.
      var delay = 0.0
      func send(_ status: UInt8, _ d1: UInt8, _ d2: UInt8) {
        if delay == 0 {
          self.emit(status, d1, d2, port: port)
        } else {
          self.queue.asyncAfter(deadline: .now() + delay) { [weak self] in self?.emit(status, d1, d2, port: port) }
        }
        delay += 0.015
      }
      if bankMSB >= 0 { send(0xB0 | ch, 0, UInt8(min(127, bankMSB))) }
      if bankLSB >= 0 { send(0xB0 | ch, 32, UInt8(min(127, bankLSB))) }
      send(0xC0 | ch, UInt8(max(0, min(127, program))), 0)
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

  /// Keeps sending MIDI clock pulses while stopped (if the clock and "keep running" are on), on its own
  /// timer, so a follower such as DrumJam stays locked to the tempo and a Play starts cleanly. While the
  /// transport runs, `pump` sends the pulses instead (tick-aligned).
  private func updateIdleClock() {
    let want = !running && (config?.clock ?? false) && (config?.clockAlways ?? false)
    if want, idleTimer == nil {
      if idleNextPulse == 0 { idleNextPulse = ProcessInfo.processInfo.systemUptime + 0.005 }
      let t = DispatchSource.makeTimerSource(flags: .strict, queue: queue)
      t.schedule(deadline: .now(), repeating: .milliseconds(1), leeway: .microseconds(100))
      t.setEventHandler { [weak self] in self?.idlePump() }
      idleTimer = t
      t.resume()
    } else if !want, let t = idleTimer {
      t.cancel()
      idleTimer = nil
    }
  }

  private func idlePump() {
    guard !running, let c = config, c.clock, c.clockAlways else { return }
    let now = ProcessInfo.processInfo.systemUptime
    if now - idleNextPulse > 0.5 { idleNextPulse = now }
    let interval = 60.0 / (max(20.0, min(300.0, c.bpm)) * 24.0)
    while idleNextPulse <= now {
      emit(0xF8, 0, 0)
      idleNextPulse += interval
    }
  }

  /// Panic: end every sounding note and cancel any waiting to start, on every port. If the transport is
  /// running the bass drone and the pad start again right after, so the bed carries on.
  func panic() {
    queue.async {
      self.pending.removeAll { ($0.status & 0xF0) == 0x90 && $0.d2 > 0 }
      self.heldDrone.removeAll()
      self.heldPad.removeAll()
      self.silence()
      if self.running {
        self.queue.asyncAfter(deadline: .now() + 0.15) { [weak self] in
          guard let self = self, self.running else { return }
          self.reconcileDrone(keepLevel: true, immediate: true)
          self.reconcilePadEnabled()
        }
      }
    }
  }

  /// A drum fill at the next opportunity: the last beats of this bar, or of the next one.
  func playFill() {
    queue.async { self.fillRequested = true }
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
      if tickIndex % barTicks == 0 { stepAdvance(atTick: tickIndex) }
      if tickIndex % barTicks == 0, tickIndex >= pendingLandTick, let p = pendingConfig {
        pendingConfig = nil
        // Restart the chord loop first, so installing the new settings starts the
        // drone on chord 1 straight away instead of on the old position.
        chordIndex = 0
        padStartTick = tickIndex
        sceneStartTime = nextTickTime
        resetMotion(p)
        install(p, atBar: true)
        if pendingIsAuto {
          pendingIsAuto = false
          emitScene(index: p.sceneIndex, reason: "auto")
        }
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
    drainLoops(now: now)
    drainNoise(now: now)
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
      let withStart = tick == 0 && cfg.clockTransport
      if withStart { pending.append(Pending(time: time, status: 0xFA, d1: 0, d2: 0)) }
      pending.append(Pending(time: time + (withStart ? 0.001 : 0), status: 0xF8, d1: 0, d2: 0))
    }
    if tick == 0 { startLoops(cfg, at: time) }

    // Orchestrated stop: fade, the fill into the last bar line, and the ending itself.
    if ended { return }
    if endTick >= 0 {
      if let plan = endPlan, plan.fadeBars > 0 {
        let start = endTick - plan.fadeBars * barTicks
        endFade = tick < start ? 1 : max(0, Double(endTick - tick) / Double(max(1, endTick - start)))
      } else {
        endFade = 1
      }
      if tick >= endTick {
        // (If the planned bar line was missed because the engine stalled, end now.)
        performEnding(at: time, tickDur: tickDur, cfg: cfg)
        return
      }
      if (endTick - tick) % barTicks == 0 {
        let left = (endTick - tick) / barTicks
        let cb = onEnding
        DispatchQueue.main.async { cb?(["barsLeft": left, "reason": "tick"]) }
      }
    }

    // Breathing: at every bar line after the scene's first, step each rule.
    let sceneTick = tick - padStartTick
    if sceneTick > 0, sceneTick % barTicks == 0, !cfg.frozen {
      stepMotion(at: time, cfg: cfg)
      stepRecurring(time: time, bar: sceneTick / barTicks, cfg: cfg)
      stepEvolve(bar: sceneTick / barTicks, cfg: cfg)
    }

    // Loop player: start, restart and stop lanes on bar lines (a loop restarts every `bars` bars, so the audio
    // clock never drifts away from the bed).
    if tick % barTicks == 0 { stepLanes(tick: tick, time: time, tickDur: tickDur, cfg: cfg) }

    // MidiDancer: a call on a bar line, then a response space. Freeze does not pause it.
    if sceneTick >= 0, sceneTick % barTicks == 0 {
      stepDancer(at: time, tickDur: tickDur, cfg: cfg)
    }

    // Harmony: the chord loop changes chord every `barsPerChord` bars (counted from
    // the last scene switch). The pad and a following bass both change then.
    // Common tones are left sounding, never retriggered, so changes glide. Nothing
    // here is rhythmic: these are sustained notes.
    let chordTicks = barTicks * max(1, cfg.harmony.barsPerChord)
    let rel = tick - padStartTick
    if rel >= 0, rel % chordTicks == 0 {
      chordIndex = (rel / chordTicks) % max(1, cfg.harmony.count)
      let padList = activePadChords(cfg)
      if padOn(cfg), !padList.isEmpty {
        playPad(padList[chordIndex % padList.count], pad: cfg.pad, at: time, retrigger: false)
      }
      if droneOn(cfg), activeDroneChords(cfg).count > 1, !heldDrone.isEmpty {
        reconcileDrone(keepLevel: true)
      }
    }

    // Drone retrigger (keeps the current fade level, so it does not fade in again).
    if droneOn(cfg), cfg.drone.retriggerBars > 0, tick > 0,
      tick % (barTicks * cfg.drone.retriggerBars) == 0
    {
      releaseDrone()
      reconcileDrone(keepLevel: true)
    }

    guard tick % ticksPerStep == 0 else { return }
    let step = tick / ticksPerStep
    let stepDur = tickDur * Double(ticksPerStep)

    // Fills: plan one if one is due, and keep the normal pattern silent while it plays.
    planFillIfDue(tick: tick, time: time, tickDur: tickDur, cfg: cfg)
    if tick >= fillStartTick && tick < fillEndTick { return }

    // Swing: push every second 16th later, up to half a step.
    let swingDelay = (step % 2 == 1) ? max(0, min(1, cfg.swing)) * stepDur * 0.5 : 0

    for (i, drum) in cfg.drums.enumerated() where drum.enabled || (i < drumLevels.count && drumLevels[i] > 0.001) {
      let steps = max(1, min(64, drum.steps))
      var hits = max(0, min(steps, drum.hits))
      var rotation = drum.rotation
      if i < evoHits.count {
        if hits > 0 { hits = max(1, min(steps, hits + evoHits[i])) }
        rotation += evoRot[i]
      }
      let local = step % steps
      let pos = ((local - rotation % steps) % steps + steps) % steps
      let mainHit = euclidHit(position: pos, hits: hits, steps: steps)
      // Ghost notes: a second, quiet pattern, only on steps the main pattern leaves free.
      var ghost = false
      if !mainHit, drum.ghostHits > 0 {
        let gpos = ((local - drum.ghostRotation % steps) % steps + steps) % steps
        ghost = euclidHit(position: gpos, hits: min(steps, drum.ghostHits), steps: steps)
      }
      guard mainHit || ghost else { continue }
      let sure = mainHit && drum.keepFirst && pos == 0
      if !sure, drum.probability < 1, Double.random(in: 0..<1, using: &rng) > drum.probability { continue }

      var vel = Double(ghost ? drum.ghostVelocity : drum.velocity)
      if mainHit, drum.accentEvery > 1 {
        // Which hit of the pattern this is (0 for the first); every Nth one is the accent.
        var rank = 0
        for j in 0..<pos where euclidHit(position: j, hits: hits, steps: steps) { rank += 1 }
        if rank % drum.accentEvery == 0 { vel *= 1 + max(0, min(1, drum.accentBoost)) }
      }
      if drum.humanize > 0 {
        vel *= 1 - drum.humanize * 0.4 * Double.random(in: 0..<1, using: &rng)
      }
      if i < drumLevels.count { vel *= drumLevels[i] }
      vel *= endFade
      guard vel >= 1 else { continue }
      let v = UInt8(max(1, min(127, Int(vel))))
      let ch = UInt8(max(0, min(15, drum.channel)))
      let loose = drum.looseMs > 0 ? Double.random(in: 0..<1, using: &rng) * drum.looseMs / 1000 : 0
      let start = time + swingDelay + loose
      pending.append(Pending(time: start, status: 0x90 | ch, d1: UInt8(max(0, min(127, drum.note))), d2: v))
      pending.append(Pending(time: start + 0.09, status: 0x80 | ch, d1: UInt8(max(0, min(127, drum.note))), d2: 0))
    }
  }

  /// The planned bar line has arrived: the last hit, release everything softly and let the tails ring,
  /// then stop the transport a moment later (so the final hit and the noise are still delivered).
  private func performEnding(at time: Double, tickDur: Double, cfg: MidiBedConfig) {
    guard let plan = endPlan else {
      endTick = -1
      return
    }
    if plan.finalHit, let k = cfg.drums.first(where: { $0.role == "kick" && $0.enabled }) {
      let ch = UInt8(max(0, min(15, k.channel)))
      let note = UInt8(max(0, min(127, k.note)))
      pending.append(Pending(time: time, status: 0x90 | ch, d1: note, d2: 124))
      pending.append(Pending(time: time + 0.25, status: 0x80 | ch, d1: note, d2: 0))
    }
    if plan.noise {
      let bpm = max(20.0, min(300.0, cfg.bpm))
      let secs = noiseSeconds(shape: plan.noiseShape, beats: 8, bpm: bpm)
      pendingNoise.append(
        PendingNoise(time: time, tag: 9, shape: plan.noiseShape, color: 2, pre: 0, post: max(secs.post, 1.5), offset: 0, level: plan.noiseLevel))
    }
    // The loop lanes stop on the bar line too.
    for i in 0..<LoopPlayer.laneCount where laneActive[i] {
      pendingLoop.append(PendingLoop(time: time, lane: i, start: false, seconds: 0))
      laneActive[i] = false
    }
    // The held bass and pad notes end exactly on the bar line (not a lookahead early).
    for h in heldDrone + heldPad {
      pending.append(Pending(time: time, status: 0x80 | UInt8(h.channel), d1: UInt8(h.note), d2: 0))
    }
    heldDrone = []
    heldPad = []
    ended = true
    endTick = -1
    endPlan = nil
    endFade = 1
    let cb = onEnding
    DispatchQueue.main.async { cb?(["barsLeft": 0, "reason": "end"]) }
    queue.asyncAfter(deadline: .now() + 1.0) { [weak self] in
      guard let self = self, self.running, self.ended else { return }
      self.stopOnQueue(soft: true)
      let done = self.onEnded
      DispatchQueue.main.async { done?() }
    }
  }

  /// Set an orchestrated stop. Works out the bar line it lands on (never closer than a beat away).
  func requestEnd(json: String) {
    guard let data = json.data(using: .utf8), let plan = try? JSONDecoder().decode(MidiBedEndRequest.self, from: data) else {
      NSLog("MidiBedEngine: could not decode end request")
      return
    }
    queue.async {
      guard self.running, let cfg = self.config, !self.ended else { return }
      let barTicks = self.ticksPerBeat * self.beatsPerBar
      let toBar = (barTicks - (self.tickIndex % barTicks)) % barTicks
      var firstBar = self.tickIndex + toBar
      if toBar < self.ticksPerBeat { firstBar += barTicks }
      var target = firstBar
      let progression = { () -> Int in
        let chordTicks = barTicks * max(1, cfg.harmony.barsPerChord)
        let loop = chordTicks * max(1, cfg.harmony.count)
        let rel = firstBar - self.padStartTick
        let n = max(1, (rel + loop - 1) / loop)
        return self.padStartTick + n * loop
      }
      switch plan.style {
      case 2:
        target = progression()
      case 3:
        if cfg.advance.mode > 0, self.advanceBarsLeft > 0 {
          target = max(firstBar, (self.tickIndex + toBar) + (self.advanceBarsLeft - 1) * barTicks)
        } else {
          target = progression()
        }
      default:
        break
      }
      self.endTick = target
      self.endPlan = plan
      // A fill into the last bar line, when fills are on.
      if cfg.fill.enabled, !cfg.fill.palette.isEmpty { self.fillRequested = true }
      let left = (target - self.tickIndex) / barTicks
      let cb = self.onEnding
      DispatchQueue.main.async { cb?(["barsLeft": left, "reason": "set"]) }
    }
  }

  // MARK: Loop player

  private func loopSeconds(_ bars: Int, _ cfg: MidiBedConfig) -> Double {
    let beat = 60.0 / max(20.0, min(300.0, cfg.bpm))
    return Double(max(1, bars)) * Double(beatsPerBar) * beat
  }

  /// At a bar line: a lane that should play and is not yet playing starts here; one that has run its `bars`
  /// bars starts over here; one that is switched off (or whose file is gone) stops here.
  private func stepLanes(tick: Int, time: Double, tickDur: Double, cfg: MidiBedConfig) {
    let barTicks = ticksPerBeat * beatsPerBar
    for i in 0..<min(LoopPlayer.laneCount, cfg.lanes.count) {
      let lane = cfg.lanes[i]
      let ready = !lane.path.isEmpty && synth.loops.isReady(i)
      if lane.on && ready {
        let span = max(1, lane.bars) * barTicks
        if !laneActive[i] || (tick - laneStart[i]) % span == 0 {
          pendingLoop.append(PendingLoop(time: time, lane: i, start: true, seconds: loopSeconds(lane.bars, cfg), repeats: max(1, lane.repeats)))
          laneActive[i] = true
          laneStart[i] = tick
        }
      } else if laneActive[i] {
        pendingLoop.append(PendingLoop(time: time, lane: i, start: false, seconds: 0))
        laneActive[i] = false
      }
    }
  }

  /// The lanes of a configuration just installed: load the files, set the levels, and cut a lane whose file
  /// changed (the new one starts on the next bar line when it has finished loading).
  private func applyLanes(_ cfg: MidiBedConfig) {
    for i in 0..<LoopPlayer.laneCount {
      let lane = i < cfg.lanes.count ? cfg.lanes[i] : nil
      let path = lane?.path ?? ""
      if lanePath[i] != path {
        lanePath[i] = path
        if laneActive[i] {
          synth.loops.stop(lane: i, fade: 0.02)
          laneActive[i] = false
        }
      }
      synth.loops.load(lane: i, path: path)
      synth.loops.setMix(lane: i, level: Float(lane?.level ?? 1), pan: Float(lane?.pan ?? 0))
      // A tempo change: the lane keeps its place at its new speed.
      if let l = lane, laneActive[i] { synth.loops.retune(lane: i, seconds: loopSeconds(l.bars, cfg), repeats: max(1, l.repeats)) }
    }
  }

  private func drainLoops(now: Double) {
    guard !pendingLoop.isEmpty else { return }
    var later: [PendingLoop] = []
    for p in pendingLoop {
      if p.time <= now {
        if p.start { synth.loops.start(lane: p.lane, seconds: p.seconds, repeats: p.repeats) } else { synth.loops.stop(lane: p.lane) }
      } else {
        later.append(p)
      }
    }
    pendingLoop = later
  }

  /// Length, sample rate and channels of an audio file, for the library.
  static func probeLoop(path: String) -> [String: Any]? {
    guard let p = LoopPlayer.probe(path: path) else { return nil }
    return ["seconds": p.seconds, "sampleRate": p.sampleRate, "channels": p.channels]
  }

  /// Evolving patterns: every `everyBars` bars each drum (except the kick) has a chance to be nudged: one hit
  /// more or fewer, or its rotation moved a step, never more than two away from its own pattern. After
  /// `returnAfter` changes it goes back to the original. Freeze pauses it (the caller checks).
  private func stepEvolve(bar: Int, cfg: MidiBedConfig) {
    let e = cfg.evolve
    guard e.everyBars > 0, bar % e.everyBars == 0 else { return }
    if evoHits.count != cfg.drums.count {
      evoHits = [Int](repeating: 0, count: cfg.drums.count)
      evoRot = [Int](repeating: 0, count: cfg.drums.count)
      evoCount = [Int](repeating: 0, count: cfg.drums.count)
    }
    for (i, d) in cfg.drums.enumerated() where d.enabled && d.role != "kick" && d.hits > 0 {
      guard Double.random(in: 0..<1, using: &rng) < e.chance else { continue }
      evoCount[i] += 1
      if evoCount[i] > max(1, e.returnAfter) {
        evoHits[i] = 0
        evoRot[i] = 0
        evoCount[i] = 0
        continue
      }
      let step = Bool.random(using: &rng) ? 1 : -1
      if Bool.random(using: &rng) {
        evoRot[i] = max(-2, min(2, evoRot[i] + step))
      } else {
        evoHits[i] = max(-2, min(2, evoHits[i] + step))
      }
    }
  }

  // MARK: Drum fills

  /// Is a fill due at this tick (a sixteenth-note step)? If so, schedule its hits as ordinary drum notes and
  /// silence the normal pattern until the downbeat. The shape of a fill is src/fill.ts (planFill).
  private func planFillIfDue(tick: Int, time: Double, tickDur: Double, cfg: MidiBedConfig) {
    let f = cfg.fill
    guard f.enabled, !f.palette.isEmpty, tick >= fillEndTick else { return }
    let barTicks = ticksPerBeat * beatsPerBar
    let pos = tick % barTicks
    let remaining = barTicks - pos
    let maxTicks = ticksPerBeat * max(1, min(2, f.maxBeats))
    var play = false

    if pos == barTicks - maxTicks {
      // The moment to decide for this bar: the start of the longest fill that could happen.
      let barIndex = (tick - padStartTick) / barTicks
      var due = f.everyBars > 0 && (barIndex + 1) % f.everyBars == 0
      if !due, f.beforeScene {
        if pendingConfig != nil, tick - pos + barTicks >= pendingLandTick { due = true } // a switch lands on the next bar line
        else if cfg.advance.mode > 0, advanceBarsLeft == 1, !cfg.frozen { due = true } // auto-advance is next
      }
      if !due, f.afterBreakdown, cfg.motion.drums.baseBars > 0, drumRT.alt, drumRT.barsLeft == 1,
        let r = drumRT.roll, r * 100 < cfg.motion.drums.chance
      {
        due = true // the drums come back at the next bar line
      }
      // During a breakdown the drums are out on purpose: no scheduled fill, except the one that leads the
      // drums back in (the afterBreakdown trigger above).
      if due, drumRT.alt, !(f.afterBreakdown && drumRT.barsLeft == 1) { due = false }
      if due, Double.random(in: 0..<1, using: &rng) < f.chance { play = true }
      if fillRequested {
        play = true
        fillRequested = false
      }
    } else if fillRequested, pos > barTicks - maxTicks, remaining >= ticksPerStep * 2 {
      // Asked for after the usual start: fit what is left of the bar.
      play = true
      fillRequested = false
    }
    guard play else { return }

    // A length of 1, 1.5 or 2 beats, within the maximum and within what is left of the bar.
    let options = f.maxBeats >= 2 ? [4, 6, 8] : [4]
    var steps = options[Int.random(in: 0..<options.count, using: &rng)]
    steps = max(2, min(steps, remaining / ticksPerStep))
    let lenTicks = steps * ticksPerStep
    let barEndTick = tick + remaining
    let startTick = barEndTick - lenTicks
    let stepDur = tickDur * Double(ticksPerStep)
    let startTime = time + Double(startTick - tick) * tickDur
    let endTime = time + Double(remaining) * tickDur

    // Which sixteenths: always the last, then random others, at the density.
    let k = max(2, min(steps, Int((1 + f.density * Double(steps - 1)).rounded())))
    var pool = Array(0..<(steps - 1))
    pool.shuffle(using: &rng)
    var slots = [steps - 1] + Array(pool.prefix(k - 1))
    slots.sort()

    var snares: [Int] = []
    var toms: [Int] = []
    for (i, v) in f.palette.enumerated() { if v.role == 0 { snares.append(i) } else { toms.append(i) } }
    toms.sort { f.palette[$0].role < f.palette[$1].role } // high to low
    guard !snares.isEmpty || !toms.isEmpty else { return }

    var tomPos = 0
    func hit(at when: Double, voice: Int, velocity: Int) {
      let v = f.palette[voice]
      let ch = UInt8(max(0, min(15, v.channel)))
      let note = UInt8(max(0, min(127, v.note)))
      pending.append(Pending(time: when, status: 0x90 | ch, d1: note, d2: UInt8(max(1, min(127, velocity)))))
      pending.append(Pending(time: when + 0.09, status: 0x80 | ch, d1: note, d2: 0))
    }
    for (i, s) in slots.enumerated() {
      let p = slots.count > 1 ? Double(i) / Double(slots.count - 1) : 1
      var voice: Int
      if toms.isEmpty {
        voice = snares[Int.random(in: 0..<snares.count, using: &rng)]
      } else if snares.isEmpty {
        voice = toms[tomPos]
      } else {
        voice = Double.random(in: 0..<1, using: &rng) < 0.35 + 0.2 * p ? snares[Int.random(in: 0..<snares.count, using: &rng)] : toms[tomPos]
      }
      if !toms.isEmpty, Double.random(in: 0..<1, using: &rng) < 0.6 { tomPos = min(toms.count - 1, tomPos + 1) }
      let base = Double(f.palette[voice].velocity)
      let vel = Int((base * (0.7 + 0.4 * p) * (0.92 + 0.16 * Double.random(in: 0..<1, using: &rng))).rounded())
      hit(at: startTime + Double(s) * stepDur, voice: voice, velocity: vel)
    }
    // The last hit lands on the downbeat of the next bar, where the normal pattern comes back.
    let finalVoice = toms.isEmpty ? snares[0] : toms[toms.count - 1]
    hit(at: endTime, voice: finalVoice, velocity: Int((Double(f.palette[finalVoice].velocity) * 1.15).rounded()))

    fillStartTick = startTick
    fillEndTick = barEndTick
  }

  /// Standard Euclidean spread: hit when (pos * hits) mod steps < hits.
  private func euclidHit(position: Int, hits: Int, steps: Int) -> Bool {
    if hits <= 0 { return false }
    return (position * hits) % steps < hits
  }

  // MARK: Transitions

  /// The bar line a scene switch asked for now lands on: the next bar line, the end of the progression
  /// (the chord loop comes back to its first chord, counted from the scene start), or the end of the scene
  /// (the auto-advance countdown when there is one, else the end of the progression).
  private func landingTick(_ cfg: MidiBedConfig) -> Int {
    let barTicks = ticksPerBeat * beatsPerBar
    let toBar = (barTicks - (tickIndex % barTicks)) % barTicks
    let first = tickIndex + toBar
    func progression() -> Int {
      let chordTicks = barTicks * max(1, cfg.harmony.barsPerChord)
      let loop = chordTicks * max(1, cfg.harmony.count)
      let rel = first - padStartTick
      if rel <= 0 { return first }
      return padStartTick + ((rel + loop - 1) / loop) * loop
    }
    switch cfg.sceneChangeAt {
    case 1:
      return progression()
    case 2:
      if cfg.advance.mode > 0, advanceBarsLeft > 0 { return first + (advanceBarsLeft - 1) * barTicks }
      return progression()
    default:
      return first
    }
  }

  /// The time (the engine's clock) a tick will be processed.
  private func timeOfTick(_ tick: Int, _ cfg: MidiBedConfig) -> Double {
    let tickDur = 60.0 / (max(20.0, min(300.0, cfg.bpm)) * Double(ticksPerBeat))
    return nextTickTime + Double(tick - tickIndex) * tickDur
  }

  /// When the next bar line falls, in the engine's clock.
  private func nextBarTime(_ cfg: MidiBedConfig) -> Double {
    let barTicks = ticksPerBeat * beatsPerBar
    let tickDur = 60.0 / (max(20.0, min(300.0, cfg.bpm)) * Double(ticksPerBeat))
    let toBar = (barTicks - (tickIndex % barTicks)) % barTicks
    return nextTickTime + Double(toBar) * tickDur
  }

  /// Seconds of lead-up (before the bar line) and tail (after it) for a shape.
  private func noiseSeconds(shape: Int, beats: Double, bpm: Double) -> (pre: Double, post: Double) {
    let len = max(0.25, beats) * 60.0 / bpm
    switch shape {
    case 0: return (len, len)                       // Wave: rises into the bar, falls away after
    case 1: return (len, 0.18)                      // Wind: rises into the bar, then a short cut
    case 2: return (0, max(len, 1.5))               // Thunder
    case 3: return (0, max(min(len, 3.0), 0.7))     // Boom
    default: return (0, len)                        // Crash
    }
  }

  /// Must behave exactly like `planTransition` in src/transitions.ts (which is unit-tested):
  /// enough room -> the lead-in plays, joining its sweep part-way if it is late; too close
  /// (less than minLeadBeats) -> only the "downer" on the bar: Wave its falling half, Wind a Crash.
  private func scheduleTransition(_ slot: MidiBedTransitionSlot, tag: Int, barTime: Double, cfg: MidiBedConfig) {
    guard slot.on else { return }
    let bpm = max(20.0, min(300.0, cfg.bpm))
    let beat = 60.0 / bpm
    let now = ProcessInfo.processInfo.systemUptime
    var shape = slot.shape
    var (pre, post) = noiseSeconds(shape: shape, beats: slot.beats, bpm: bpm)
    var offset = 0.0
    if pre > 0 {
      let remaining = barTime - now
      if remaining >= cfg.transitions.minLeadBeats * beat {
        offset = max(0, pre - remaining)
      } else if shape == 0 {
        offset = pre
      } else {
        shape = 4
        (pre, post) = noiseSeconds(shape: 4, beats: slot.beats, bpm: bpm)
        offset = 0
      }
    }
    pendingNoise.append(
      PendingNoise(
        time: max(now, barTime - (pre - offset)), tag: tag, shape: shape, color: slot.color,
        pre: pre, post: post, offset: offset, level: slot.level))
  }

  /// Play a transition right now, for hearing what a setting sounds like.
  func playTransitionNow(shape: Int, color: Int, beats: Double, level: Double) {
    queue.async {
      let bpm = max(20.0, min(300.0, self.config?.bpm ?? 88))
      let secs = self.noiseSeconds(shape: shape, beats: beats, bpm: bpm)
      self.synth.postNoise(shape: shape, color: color, pre: secs.pre, post: secs.post, offset: 0, level: level)
    }
  }

  private func drainNoise(now: Double) {
    guard !pendingNoise.isEmpty else { return }
    var later: [PendingNoise] = []
    for n in pendingNoise {
      if n.time <= now {
        synth.postNoise(shape: n.shape, color: n.color, pre: n.pre, post: n.post, offset: n.offset, level: n.level)
      } else {
        later.append(n)
      }
    }
    pendingNoise = later
  }

  // MARK: Auto-advance

  /// Which scene comes next, or -1. Must behave like `pickTarget` in src/advance.ts (unit-tested).
  private func pickAdvanceTarget(_ cfg: MidiBedConfig) -> Int {
    let n = sceneConfigs.count
    guard cfg.advance.mode > 0, n >= 2 else { return -1 }
    switch cfg.advance.mode {
    case 1:
      return (cfg.sceneIndex + 1) % n
    case 2:
      let t = cfg.advance.target
      return (t == cfg.sceneIndex || t < 0 || t >= n) ? (cfg.sceneIndex + 1) % n : t
    default:
      let others = (0..<n).filter { $0 != cfg.sceneIndex }
      return others.randomElement(using: &rng) ?? -1
    }
  }

  private func emitScene(index: Int, reason: String) {
    let body: [String: Any?] = ["index": index, "barsLeft": advanceBarsLeft, "target": advanceTarget, "reason": reason]
    let cb = onScene
    DispatchQueue.main.async { cb?(body) }
  }

  /// Called at every bar line, before any pending scene switch is installed. Must behave like
  /// `stepAdvance` in src/advance.ts (unit-tested): the scene plays exactly `bars` bars, then the
  /// next scene begins on that bar line. Frozen: the count holds. A switch the player has already
  /// asked for wins. The new scene's entrance sound is scheduled in advance, so a lead-in gets its
  /// full rise.
  private func stepAdvance(atTick tick: Int) {
    guard let cfg = config else { return }
    let bars = cfg.advance.mode > 0 ? cfg.advance.bars : 0
    if bars <= 0 {
      advanceBarsLeft = 0
      return
    }
    guard tick - padStartTick > 0, pendingConfig == nil else { return }
    var left = advanceBarsLeft <= 0 ? bars : min(advanceBarsLeft, bars)
    if cfg.frozen {
      advanceBarsLeft = left
      emitScene(index: cfg.sceneIndex, reason: "tick")
      return
    }
    left -= 1
    if advanceTarget < 0 || advanceTarget >= sceneConfigs.count { advanceTarget = pickAdvanceTarget(cfg) }
    let target = advanceTarget
    if left <= 0 {
      advanceBarsLeft = 0
      if target >= 0, target < sceneConfigs.count {
        pendingConfig = sceneConfigs[target]
        pendingLandTick = tick
        pendingIsAuto = true
      }
    } else {
      advanceBarsLeft = left
    }

    // The entrance sound of the scene we are going to.
    if target >= 0, target < sceneConfigs.count, !advanceEntranceScheduled {
      let next = sceneConfigs[target]
      let slot = next.transitions.entrance
      if slot.on {
        let bpm = max(20.0, min(300.0, cfg.bpm))
        let barDur = 60.0 / bpm * Double(beatsPerBar)
        let pre = noiseSeconds(shape: slot.shape, beats: slot.beats, bpm: bpm).pre
        let boundaryTime = nextTickTime + Double(left) * barDur
        if boundaryTime - pre < nextTickTime + barDur {
          scheduleTransition(slot, tag: 0, barTime: boundaryTime, cfg: next)
          advanceEntranceScheduled = true
        }
      }
    }
    if left > 0 { emitScene(index: cfg.sceneIndex, reason: "tick") }
  }

  // MARK: Recurring sound

  /// Bars between recurring sounds.
  private func recurringSpacing(_ cfg: MidiBedConfig) -> Int {
    let r = cfg.transitions.recurring
    return r.when == 0 ? max(1, r.everyBars) : max(1, cfg.harmony.barsPerChord) * max(1, cfg.harmony.count)
  }

  /// Decide, once, what the next boundary will play (or whether it lets its turn pass).
  private func rollRecurring(_ rec: MidiBedRecurring) {
    recurScheduled = false
    recurPlay = Double.random(in: 0..<1, using: &rng) * 100 < rec.chance
    guard recurPlay else { return }
    let allowed = (0..<5).filter { rec.shapeMask & (1 << $0) != 0 }
    if rec.vary == 1, let pick = allowed.randomElement(using: &rng) {
      recurShape = pick
    } else if rec.vary == 2, !allowed.isEmpty {
      recurShape = allowed[recurTurn % allowed.count]
      recurTurn += 1
    } else {
      recurShape = rec.shape
    }
    recurColor = rec.colorMode == 1 ? Int.random(in: 0..<3, using: &rng) : rec.color
  }

  /// Must behave exactly like `simulateRecurring` in src/transitions.ts (which is unit-tested).
  /// Called at every bar line after the scene's first, with the bar number counted from the
  /// scene start. A sound is scheduled at the first bar line whose bar contains its start
  /// (its boundary minus its lead-up); if that moment has already passed, scheduleTransition
  /// makes it join its sweep part-way.
  private func stepRecurring(time: Double, bar r: Int, cfg: MidiBedConfig) {
    let rec = cfg.transitions.recurring
    guard rec.on else {
      recurPlay = false
      return
    }
    let spacing = recurringSpacing(cfg)
    // 1. A sound already waiting goes out first, if its start falls in this bar. (A sound that
    //    plays ON the boundary is due at the very bar line where that boundary is reached, so it
    //    must be scheduled BEFORE the next boundary is rolled, or the roll would replace it.)
    scheduleRecurringIfDue(time: time, bar: r, cfg: cfg)
    // 2. Reaching a boundary: decide the next one, and schedule it at once if it is already due.
    if recurBoundary <= r {
      recurBoundary = (r / spacing + 1) * spacing
      rollRecurring(rec)
      scheduleRecurringIfDue(time: time, bar: r, cfg: cfg)
    }
  }

  private func scheduleRecurringIfDue(time: Double, bar r: Int, cfg: MidiBedConfig) {
    guard recurPlay, !recurScheduled else { return }
    let rec = cfg.transitions.recurring
    let bpm = max(20.0, min(300.0, cfg.bpm))
    let barDur = 60.0 / bpm * Double(beatsPerBar)
    let pre = noiseSeconds(shape: recurShape, beats: rec.beats, bpm: bpm).pre
    let boundaryTime = time - Double(r) * barDur + Double(recurBoundary) * barDur
    if boundaryTime - pre < time + barDur {
      let slot = MidiBedTransitionSlot(on: true, shape: recurShape, color: recurColor, beats: rec.beats, level: rec.level)
      scheduleTransition(slot, tag: 3, barTime: boundaryTime, cfg: cfg)
      recurScheduled = true
    }
  }

  // MARK: Breathing

  /// The notes to play: the other version only when the rule's alternate IS another
  /// version (kind 0). A drop-out (kind 1) keeps the normal notes; the layer is just off.
  private func activeDroneChords(_ cfg: MidiBedConfig) -> [[Int]] {
    bassRT.alt && cfg.motion.bass.kind == 0 && !cfg.drone.altChords.isEmpty ? cfg.drone.altChords : cfg.drone.chords
  }

  private func activePadChords(_ cfg: MidiBedConfig) -> [[Int]] {
    padRT.alt && cfg.motion.pad.kind == 0 && !cfg.pad.altChords.isEmpty ? cfg.pad.altChords : cfg.pad.chords
  }

  /// Switched on AND not currently dropped out by its breathing rule.
  private func droneOn(_ cfg: MidiBedConfig) -> Bool {
    cfg.drone.enabled && !(bassRT.alt && cfg.motion.bass.kind == 1)
  }

  private func padOn(_ cfg: MidiBedConfig) -> Bool {
    cfg.pad.enabled && !(padRT.alt && cfg.motion.pad.kind == 1)
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
    let r = rt.roll ?? Double.random(in: 0..<1, using: &rng)
    rt.roll = nil
    if r * 100 < chance {
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
    // Lead-ins the old scene had scheduled but not started are dropped (the new scene's own
    // scene-start sound, tag 0, is kept: it is due on this very bar line).
    pendingNoise.removeAll { $0.tag != 0 }
    // The recurring sound: the first boundary is skipped, so nothing recurring plays in the first loop.
    recurBoundary = recurringSpacing(cfg)
    recurPlay = false
    recurScheduled = true
    recurTurn = 0
    // Solo mode with carry-on keeps its place through a scene change.
    if !(cfg.dancer.mode == 1 && cfg.dancer.carryOn) {
      dancerWait = 0
      dancerTurn = 0
    }
    advanceBarsLeft = cfg.advance.mode > 0 ? max(0, cfg.advance.bars) : 0
    advanceTarget = pickAdvanceTarget(cfg)
    evoHits = [Int](repeating: 0, count: cfg.drums.count)
    evoRot = [Int](repeating: 0, count: cfg.drums.count)
    evoCount = [Int](repeating: 0, count: cfg.drums.count)
    advanceEntranceScheduled = false
    emitMotion("reset")
    emitScene(index: cfg.sceneIndex, reason: "tick")
  }

  /// At each bar line: count down the space, and when it is over play the next phrase.
  private func stepDancer(at time: Double, tickDur: Double, cfg: MidiBedConfig) {
    let d = cfg.dancer
    guard d.enabled, !d.phrases.isEmpty else {
      dancerWait = 0
      return
    }
    if dancerWait > 0 { dancerWait -= 1 }
    guard dancerWait == 0 else { return }
    let n = d.phrases.count
    var idx = 0
    if d.pick == 0 {
      idx = dancerTurn % n
      dancerTurn += 1
    } else if d.pick == 1 {
      idx = Int.random(in: 0..<n, using: &rng)
    } else if d.pick == 3 {
      // Back and forth through the pool (it runs from sparse to busy in solo mode).
      let period = max(1, 2 * (n - 1))
      let t = dancerTurn % period
      idx = t < n ? t : period - t
      dancerTurn += 1
    }
    let phrase = d.phrases[idx]
    // The phrase's own bars, then the response space (the same again, times spaceMult).
    if d.mode == 1 {
      // Solo: the phrase, then the rest (0 = the next phrase follows straight on).
      dancerWait = max(1, phrase.span) + max(0, d.restBars)
    } else {
      dancerWait = max(1, phrase.span) * (1 + max(1, d.spaceMult))
    }
    let stepDur = tickDur * Double(ticksPerStep)
    let ch = UInt8(max(0, min(15, d.channel)))
    let legato = Double(max(0, min(100, d.legato))) / 100
    let events = phrase.events.filter { $0.count >= 4 }
    for (i, e) in events.enumerated() {
      let startStep = max(0, e[0])
      let start = time + Double(startStep) * stepDur
      let len = Double(max(1, e[1]))
      let note = UInt8(max(0, min(127, e[2])))
      let vel = UInt8(max(1, min(127, e[3])))
      var off = start + len * stepDur * 0.92
      // Legato: when the next note follows straight on, let this one overlap it a little, so a mono sound
      // joins them and a sampled instrument does not breathe between them.
      if legato > 0, i + 1 < events.count, events[i + 1][0] == startStep + Int(len) {
        let joined = start + len * stepDur + 0.03
        off += (joined - off) * legato
      }
      // Pitch: vibrato, scoop and fall-off, sent as pitch bend (and the mod wheel for vibrato in mode 1).
      let dur = off - start
      let range = Double(max(1, min(48, d.bendRange)))
      let bends = d.bendChance > 0 && Double.random(in: 0..<1, using: &rng) < d.bendChance
      let scoop = bends ? d.scoopCents : 0
      // A fall-off belongs at the END of a phrase, before a rest: the last note, or one the next note
      // does not follow straight on from. Never in the middle of a joined run.
      let phraseEnd = i + 1 >= events.count || events[i + 1][0] != startStep + Int(len)
      let fall = (bends && phraseEnd) ? d.fallCents : 0
      // A dip is an occasional sag partway through a LONG note (a beat and a half or more).
      let dip = (d.dipCents > 0 && Int(len) >= 6 && Double.random(in: 0..<1, using: &rng) < d.dipChance) ? d.dipCents : 0
      let dipAt = dur * Double.random(in: 0.40..<0.65, using: &rng)
      let vibrato = d.vibratoCents
      if scoop > 0 || fall > 0 || dip > 0 || vibrato > 0 {
        func pb(_ cents: Double) -> (UInt8, UInt8) {
          let v = Int((8192 + cents / (range * 100) * 8192).rounded())
          let c = max(0, min(16383, v))
          return (UInt8(c & 0x7F), UInt8((c >> 7) & 0x7F))
        }
        var t = 0.0
        var lastPB = -1
        var lastMod = -1
        let stepSec = 0.012
        while t <= dur {
          var cents = 0.0
          if scoop > 0 {
            let k = min(1, t / max(0.01, d.scoopSec))
            cents -= scoop * (1 - k) * (1 - k)
          }
          if fall > 0 {
            let fs = dur - d.fallSec
            if t > fs {
              let k = min(1, (t - fs) / max(0.01, d.fallSec))
              cents -= fall * k * k
            }
          }
          if dip > 0 {
            let dt = max(0.03, d.dipSec)
            let x = (t - dipAt) / dt
            func ease(_ v: Double) -> Double { let c = max(0, min(1, v)); return c * c * (3 - 2 * c) }
            if x > 0 && x < 2 { cents -= dip * (x <= 1 ? ease(x) : 1 - ease(x - 1)) }
          }
          var vib = 0.0
          if vibrato > 0, t > d.vibratoDelay {
            let ramp = min(1, (t - d.vibratoDelay) / 0.15)
            vib = vibrato * ramp * sin(2 * Double.pi * d.vibratoHz * (t - d.vibratoDelay))
          }
          let total = d.vibratoMode == 0 ? cents + vib : cents
          let (lsb, msb) = pb(total)
          let packed = Int(msb) << 7 | Int(lsb)
          if packed != lastPB {
            // the first one goes just before the note so it starts already bent
            let when = t == 0 ? start - 0.003 : start + t
            pending.append(Pending(time: when, status: 0xE0 | ch, d1: lsb, d2: msb))
            lastPB = packed
          }
          if d.vibratoMode == 1, vibrato > 0 {
            let ramp = t > d.vibratoDelay ? min(1, (t - d.vibratoDelay) / 0.2) : 0
            let m = Int((min(1, vibrato / 100) * 127 * ramp).rounded())
            if m != lastMod {
              pending.append(Pending(time: start + t, status: 0xB0 | ch, d1: 1, d2: UInt8(m)))
              lastMod = m
            }
          }
          t += stepSec
        }
        // Back to the centre when the note ends, unless the next note follows straight on and sets its own.
        let nextStarts = i + 1 < events.count ? time + Double(max(0, events[i + 1][0])) * stepDur : Double.infinity
        if nextStarts - off > 0.15 {
          let (lsb, msb) = pb(0)
          pending.append(Pending(time: off + 0.03, status: 0xE0 | ch, d1: lsb, d2: msb))
          if d.vibratoMode == 1 { pending.append(Pending(time: off + 0.03, status: 0xB0 | ch, d1: 1, d2: 0)) }
        }
      }
      pending.append(Pending(time: start, status: 0x90 | ch, d1: note, d2: vel))
      pending.append(Pending(time: off, status: 0x80 | ch, d1: note, d2: 0))
    }
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
      if m.bass.kind == 1 {
        // Drop-out: going out eases out through updateFades. Coming back is immediate:
        // full level, notes on right now, on the bar line.
        if !bassRT.alt, cfg.drone.enabled {
          droneLevel = 1
          if !heldDrone.isEmpty { sendChannelLevel(cfg.drone.channel, force: true) }
          reconcileDrone(keepLevel: true, immediate: true)
        }
      } else if cfg.drone.enabled {
        // The bass notes change right now, on the bar line; shared notes keep sounding.
        reconcileDrone(keepLevel: true)
      }
    }
    if stepRule(&padRT, baseBars: m.pad.baseBars, altBars: m.pad.altBars, chance: m.pad.chance) {
      changed = true
      let list = activePadChords(cfg)
      if m.pad.kind == 1 {
        if !padRT.alt, cfg.pad.enabled, !list.isEmpty {
          padLevel = 1
          if !heldPad.isEmpty { sendChannelLevel(cfg.pad.channel, force: true) }
          playPad(list[chordIndex % list.count], pad: cfg.pad, at: time, retrigger: false, immediate: true)
        }
      } else if cfg.pad.enabled, !list.isEmpty {
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
    // Lookahead: on the FINAL bar of a drum phase, settle the chance roll for the coming
    // change now (once), so a lead-in can rise into it. At the end of the normal phase
    // the change is a BREAK; at the end of a breakdown it is the RETURN (kick on the downbeat).
    if m.drums.baseBars > 0, drumRT.barsLeft == 1, drumRT.roll == nil {
      let r = Double.random(in: 0..<1, using: &rng)
      drumRT.roll = r
      if r * 100 < m.drums.chance {
        let tickDur = 60.0 / (max(20.0, min(300.0, cfg.bpm)) * Double(ticksPerBeat))
        let barDur = tickDur * Double(ticksPerBeat * beatsPerBar)
        if drumRT.alt {
          scheduleTransition(cfg.transitions.drumReturn, tag: 1, barTime: time + barDur, cfg: cfg)
        } else {
          scheduleTransition(cfg.transitions.drumBreak, tag: 2, barTime: time + barDur, cfg: cfg)
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
    guard let level = channelLevel(ch, cfg) else { return }
    let lvl = level * endFade
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
      if !droneOn(cfg), !heldDrone.isEmpty { releaseDrone() }
      if !padOn(cfg), !heldPad.isEmpty { releasePad() }
      return
    }

    if !heldDrone.isEmpty {
      let up = droneOn(cfg)
      droneLevel = stepLevel(droneLevel, up: up, dt: dt, fadeIn: cfg.fade.droneIn, fadeOut: cfg.fade.droneOut)
      sendChannelLevel(cfg.drone.channel)
      if !up, droneLevel <= 0.001 {
        releaseDrone()
        droneLevel = 0
        scheduleCCRestore(cfg.drone.channel)
      }
    }
    if !heldPad.isEmpty {
      let up = padOn(cfg)
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

  private func reconcileDrone(keepLevel: Bool = false, immediate: Bool = false) {
    guard let cfg = config else { return }
    let d = cfg.drone
    let ch = max(0, min(15, d.channel))

    guard droneOn(cfg), running else {
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
    if startingFromSilence && immediate {
      droneLevel = 1 // a return on the beat comes in at full strength, no fade-in
    } else if startingFromSilence && !keepLevel {
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
      pending.append(Pending(time: t, status: 0xB0 | ch, d1: 0, d2: UInt8(min(127, l.bankMSB)), port: 1))
      t += 0.002
    }
    if l.bankLSB >= 0 {
      pending.append(Pending(time: t, status: 0xB0 | ch, d1: 32, d2: UInt8(min(127, l.bankLSB)), port: 1))
      t += 0.002
    }
    pending.append(Pending(time: t, status: 0xC0 | ch, d1: UInt8(max(0, min(127, l.program))), d2: 0, port: 1))
    lastLoopSelect = loopSelectKey(l)
  }

  private func startLoops(_ cfg: MidiBedConfig, at time: Double) {
    let l = cfg.loops
    guard l.enabled else { return }
    sendLoopSelect(l, at: time)
    if l.startCC > 0 {
      // Give the loop selection time to land before telling it to play.
      pending.append(Pending(time: time + 0.05, status: 0xB0 | UInt8(max(0, min(15, l.channel))), d1: UInt8(min(127, l.startCC)), d2: 127, port: 1))
    }
    loopsPlaying = true
  }

  private func stopLoops(_ cfg: MidiBedConfig) {
    let l = cfg.loops
    let cc = l.stopCC > 0 ? l.stopCC : l.startCC
    if cc > 0 { emit(0xB0 | UInt8(max(0, min(15, l.channel))), UInt8(min(127, cc)), 127, port: 1) }
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

  private func playPad(_ notes: [Int], pad: MidiBedPadConfig, at time: Double, retrigger: Bool, immediate: Bool = false) {
    let ch = max(0, min(15, pad.channel))
    let wanted = notes.map { HeldNote(channel: ch, note: max(0, min(127, $0))) }
    let startingFromSilence = heldPad.isEmpty
    let toRelease = heldPad.filter { retrigger || !wanted.contains($0) }
    var toStart = wanted.filter { retrigger || !heldPad.contains($0) }
    toStart.sort { $0.note < $1.note }

    heldPad = wanted
    if startingFromSilence, let cfg = config {
      padLevel = (!immediate && cfg.fade.cc > 0 && cfg.fade.padIn > 0) ? 0 : 1
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
    if !padOn(cfg) {
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

  /// Must behave exactly like src/wander.ts (which is unit-tested). Each filter blends a clean
  /// cycle (counted in bars from the scene start) with free wandering; the result is eased over
  /// `smoothBeats`; then filters set to oppose another take the opposite of its movement.
  private func updateWanderers(now: Double, cfg: MidiBedConfig) {
    let dt = now - lastWandererTime
    guard dt >= 0.02 else { return }
    lastWandererTime = now

    // Hold: nothing moves, nothing is sent; on release the cycle carries on from where it stopped.
    if cfg.filterHold {
      if holdSince == nil { holdSince = now }
      return
    }
    if let h = holdSince {
      sceneStartTime += now - h
      holdSince = nil
    }

    let beatDur = 60.0 / max(20.0, min(300.0, cfg.bpm))
    let barDur = beatDur * Double(beatsPerBar)
    let elapsedBars = max(0, now - sceneStartTime) / barDur

    // Pass 1: every filter moves on its own (disabled ones keep moving, so another can oppose them).
    var norms = [Double](repeating: 0, count: cfg.wanderers.count)
    for (i, w) in cfg.wanderers.enumerated() where i < wanderers.count {
      var st = wanderers[i]
      let cycle = max(0.25, w.cycleBars)
      // Free wandering: towards a random target, able to cross the whole range in `cycle` bars.
      if abs(st.target - st.pos) < 0.002 {
        st.target = Double.random(in: 0..<1, using: &rng)
      }
      let maxStep = dt / (cycle * barDur)
      st.pos += max(-maxStep, min(maxStep, st.target - st.pos))
      // The clean cycle: 0 at its start, 1 half way, back to 0.
      let p = (elapsedBars / cycle + w.phase).truncatingRemainder(dividingBy: 1)
      let lfo = 0.5 - 0.5 * cos(2 * Double.pi * p)
      let l = max(0, min(1, w.looseness))
      let raw = (1 - l) * lfo + l * st.pos
      st.shown += (raw - st.shown) * (1 - exp(-dt / max(0.05, w.smoothBeats * beatDur)))
      wanderers[i] = st
      norms[i] = st.shown
    }

    // Pass 2: opposition (from the ORIGINAL positions), then send what changed.
    for (i, w) in cfg.wanderers.enumerated() where i < wanderers.count && w.enabled {
      var value = norms[i]
      if w.opposes >= 0, w.opposes < norms.count, w.opposes != i {
        let a = max(0, min(1, w.opposeAmount))
        value = (1 - a) * value + a * (1 - norms[w.opposes])
      }
      let lo = Double(min(w.min, w.max))
      let hi = Double(max(w.min, w.max))
      let sent = Int((lo + (hi - lo) * max(0, min(1, value))).rounded())
      if sent != wanderers[i].lastSent {
        wanderers[i].lastSent = sent
        emit(0xB0 | UInt8(max(0, min(15, w.channel))), UInt8(max(0, min(127, w.cc))), UInt8(max(0, min(127, sent))))
      }
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
    for p in due { emit(p.status, p.d1, p.d2, port: p.port) }
  }

  /// End every note we know is sounding (a note-off to every port), then all-notes-off and all-sound-off
  /// on every channel as a backstop for anything we lost track of.
  private func silence(soft: Bool = false) {
    let midi = config?.midiOut ?? true
    for key in sounding {
      let ch = UInt8((key >> 8) & 0x0F)
      let note = UInt8(key & 0x7F)
      if midi { sendMIDI(0x80 | ch, note, 0, to: [0, 1, 2, 3, 4, 5]) }
      synth.post(status: 0x80 | ch, d1: note, d2: 0)
    }
    sounding.removeAll()
    allNotesOff()
    if midi, !soft {
      for ch in 0..<16 { sendMIDI(0xB0 | UInt8(ch), 120, 0, to: [0, 1, 2, 3, 4, 5]) }
      // and put the pitch bend back to the centre on the MidiDancer channel
      if let dch = config?.dancer.channel {
        sendMIDI(0xE0 | UInt8(max(0, min(15, dch))), 0, 0x40, to: [0, 1, 2, 3, 4, 5])
      }
    }
  }

  private func allNotesOff() {
    for ch in 0..<16 {
      emit(0xB0 | UInt8(ch), 123, 0)
      // ...and out every source, in case a part's port or channel changed while notes were sounding.
      if config?.midiOut ?? true { sendMIDI(0xB0 | UInt8(ch), 123, 0, to: [0, 1, 2, 3, 4, 5]) }
    }
  }

  private func emit(_ status: UInt8, _ d1: UInt8, _ d2: UInt8, port: Int = 0) {
    // Remember which notes are sounding (see `sounding`).
    if port != 1 {
      let kind = status & 0xF0
      let key = (Int(status & 0x0F) << 8) | Int(d1)
      if kind == 0x90 && d2 > 0 {
        sounding.insert(key)
      } else if kind == 0x80 || kind == 0x90 {
        sounding.remove(key)
      }
    }
    let loopsOwn = config?.loops.ownPort ?? false
    // System messages (clock, start, stop) are for other apps only. With the loops on their own port
    // they go out that source only.
    if status >= 0xF0 {
      if config?.midiOut ?? true { sendMIDI(status, d1, d2, to: loopsOwn ? [1] : [0]) }
      return
    }
    // Loop messages go out the loops source when it has one; everything else by its MIDI channel.
    let ch = Int(status & 0x0F)
    let targets = port == 1 ? (loopsOwn ? [1] : [0]) : channelPorts[ch]
    // A part switched off for MIDI (or for the built-in sound) is not sent there. Note-offs and all-notes-off
    // always go through, so switching something off never leaves a note hanging.
    let kind = status & 0xF0
    let release = kind == 0x80 || (kind == 0x90 && d2 == 0) || (kind == 0xB0 && (d1 == 123 || d1 == 120))
    let allowMIDI = port == 1 ? (config?.outputs.loops.midi ?? true) : channelMidi[ch]
    if (config?.midiOut ?? true) && (allowMIDI || release) { sendMIDI(status, d1, d2, to: targets) }
    // Loop messages are for the loops app, not the built-in sound.
    if port == 1 { return }
    if (config?.synthOut ?? true) && (channelSynth[ch] || release) { synth.post(status: status, d1: d1, d2: d2) }
    // Note-offs and all-notes-off must always reach the synth even if the
    // switch was just turned off, or a pad could hang. It ignores them harmlessly.
    else if (status & 0xF0) == 0x80 || ((status & 0xF0) == 0xB0 && d1 == 123) {
      synth.post(status: status, d1: d1, d2: d2)
    }
  }

  private func sendMIDI(_ status: UInt8, _ d1: UInt8, _ d2: UInt8, to ports: [Int] = [0]) {
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
    for p in ports where p >= 0 && p < portSources.count && portSources[p] != 0 {
      MIDIReceived(portSources[p], &packetList)
    }
  }
}
