import ExpoModulesCore

/// Bridge between the JS UI and the native MIDI engine. JS owns the settings
/// and sends them whole as a JSON string; all musical timing happens natively.
public class MidiBedEngineModule: Module {
  private let engine = MidiBedEngine()

  public func definition() -> ModuleDefinition {
    Name("MidiBedEngine")

    Events("onBeat", "onMotion", "onScene", "onMidiIn", "onEnding", "onEnded", "onRecording")

    // The screen-wide container that receives VoiceOver's three-finger page swipe.
    View(MidiBedPagerView.self) {
      Events("onPage", "onMagicTap", "onKey")
    }

    OnCreate {
      self.engine.onBeat = { [weak self] bar, beat in
        let body: [String: Any?] = ["bar": bar, "beat": beat]
        self?.sendEvent("onBeat", body)
      }
      self.engine.onMotion = { [weak self] body in
        self?.sendEvent("onMotion", body)
      }
      self.engine.onScene = { [weak self] body in
        self?.sendEvent("onScene", body)
      }
      self.engine.onMidiIn = { [weak self] body in
        self?.sendEvent("onMidiIn", body)
      }
      self.engine.onEnding = { [weak self] body in
        self?.sendEvent("onEnding", body)
      }
      self.engine.onEnded = { [weak self] in
        self?.sendEvent("onEnded", [:])
      }
      self.engine.onRecording = { [weak self] body in
        self?.sendEvent("onRecording", body)
      }
    }

    Function("setDrumVoices") { (json: String) in
      self.engine.setDrumVoices(json: json)
    }

    // Length, sample rate and channels of an audio file (for the loop library); nil if it cannot be read.
    AsyncFunction("probeLoop") { (path: String) -> [String: Any]? in
      return MidiBedEngine.probeLoop(path: path)
    }

    Function("setNetwork") { (json: String) in
      self.engine.setNetwork(json: json)
    }

    Function("sendReaperSignal") { (start: Bool) in
      self.engine.sendReaperSignalNow(start: start)
    }

    Function("networkInfo") { () -> [String: Any] in
      return self.engine.networkInfo()
    }

    Function("startRecording") {
      self.engine.startRecording()
    }

    Function("stopRecording") {
      self.engine.stopRecording()
    }

    Function("setOutputMode") { (mode: Int) in
      self.engine.setOutputMode(mode: mode)
    }

    Function("setFilter") { (json: String) in
      self.engine.setFilter(json: json)
    }

    Function("requestEnd") { (json: String) in
      self.engine.requestEnd(json: json)
    }

    Function("setBassVoice") { (json: String) in
      self.engine.setBassVoice(json: json)
    }

    Function("setFX") { (json: String) in
      self.engine.setFX(json: json)
    }

    Function("setKeysVoice") { (json: String) in
      self.engine.setKeysVoice(json: json)
    }

    Function("setPadVoice") { (json: String) in
      self.engine.setPadVoice(json: json)
    }

    Function("setScenes") { (json: String) in
      self.engine.setScenes(json: json)
    }

    Function("start") { () in
      self.engine.start()
    }

    Function("stop") { () in
      self.engine.stop()
    }

    Function("panic") { () in
      self.engine.panic()
    }

    Function("playFill") { () in
      self.engine.playFill()
    }

    // Give keyboard focus back to the key-catching view after a text field has had it.
    Function("reclaimKeyFocus") { () in
      DispatchQueue.main.async { MidiBedPagerView.current?.reclaimFirstResponder() }
    }

    Function("applyConfig") { (json: String, queued: Bool) in
      self.engine.applyConfig(json: json, queued: queued)
    }

    Function("sendControlChange") { (channel: Int, cc: Int, value: Int, loops: Bool) in
      self.engine.sendControlChange(channel: channel, cc: cc, value: value, loops: loops)
    }

    Function("setSynthLevel") { (channel: Int, value: Int) in
      self.engine.setSynthLevel(channel: channel, value: value)
    }

    Function("sendNote") { (channel: Int, note: Int, velocity: Int, durationMs: Int) in
      self.engine.sendNote(channel: channel, note: note, velocity: velocity, durationMs: durationMs)
    }

    Function("playTransitionNow") { (shape: Int, color: Int, beats: Double, level: Double) in
      self.engine.playTransitionNow(shape: shape, color: color, beats: beats, level: level)
    }

    Function("sendProgramChange") { (channel: Int, program: Int, bankMSB: Int, bankLSB: Int, loops: Bool) in
      self.engine.sendProgramChange(channel: channel, program: program, bankMSB: bankMSB, bankLSB: bankLSB, loops: loops)
    }

    Function("getStatus") { () -> [String: Any] in
      return self.engine.status()
    }
  }
}
