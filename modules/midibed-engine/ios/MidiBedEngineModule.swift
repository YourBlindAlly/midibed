import ExpoModulesCore

/// Bridge between the JS UI and the native MIDI engine. JS owns the settings
/// and sends them whole as a JSON string; all musical timing happens natively.
public class MidiBedEngineModule: Module {
  private let engine = MidiBedEngine()

  public func definition() -> ModuleDefinition {
    Name("MidiBedEngine")

    Events("onBeat")

    OnCreate {
      self.engine.onBeat = { [weak self] bar, beat in
        let body: [String: Any?] = ["bar": bar, "beat": beat]
        self?.sendEvent("onBeat", body)
      }
    }

    Function("start") { () in
      self.engine.start()
    }

    Function("stop") { () in
      self.engine.stop()
    }

    Function("applyConfig") { (json: String, queued: Bool) in
      self.engine.applyConfig(json: json, queued: queued)
    }

    Function("sendControlChange") { (channel: Int, cc: Int, value: Int) in
      self.engine.sendControlChange(channel: channel, cc: cc, value: value)
    }

    Function("sendNote") { (channel: Int, note: Int, velocity: Int, durationMs: Int) in
      self.engine.sendNote(channel: channel, note: note, velocity: velocity, durationMs: durationMs)
    }

    Function("sendProgramChange") { (channel: Int, program: Int, bankMSB: Int, bankLSB: Int) in
      self.engine.sendProgramChange(channel: channel, program: program, bankMSB: bankMSB, bankLSB: bankLSB)
    }

    Function("getStatus") { () -> [String: Any] in
      return self.engine.status()
    }
  }
}
