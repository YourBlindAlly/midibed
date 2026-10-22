import fs from 'fs';

const swift = (f: string) => fs.readFileSync(`modules/midibed-engine/ios/${f}`, 'utf8');

describe('recording a take as a MIDI file', () => {
  it('the recorder writes a format 1 file, one track per channel, in whole bars, with tempo changes', () => {
    const r = swift('MidiRecorder.swift');
    expect(r).toContain('static let division = 480');
    expect(r).toContain('func fileData(endTime: Double, beatsPerBar: Int, names: [Int: String])');
    expect(r).toContain('[0x00, 0x01,'); // format 1
    expect(r).toContain('0xFF, 0x51, 0x03'); // tempo changes
    expect(r).toContain('0xFF, 0x58, 0x04'); // time signature
    expect(r).toContain('(d1 == 120 || d1 == 123)'); // the all-notes-off backstops are not music
  });

  it('the engine records what emit plays, starts on a bar line, and finishes on stop', () => {
    const e = swift('MidiBedEngine.swift');
    expect(e).toContain('recorder.add(time: when ?? eventTime');
    expect(e).toContain('func startRecording()');
    expect(e).toContain('func stopRecording()');
    expect(e).toContain('if self.recState == 2 { self.finishRecording() }');
    expect(e).toContain('self.recorder.reset(startTime: self.nextTickTime');
    // loop-app messages and system messages are not part of the take
    expect(e).toContain('port != 1 && status < 0xF0');
  });

  it('the module, the bridge and the screen are wired up, and Files can show the folder', () => {
    const m = swift('MidiBedEngineModule.swift');
    expect(m).toContain('Function("startRecording")');
    expect(m).toContain('Function("stopRecording")');
    expect(m).toContain('"onRecording"');
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('<Section title="Record a MIDI file">');
    expect(app).toContain('Share the last recording');
    const cfg = fs.readFileSync('app.config.js', 'utf8');
    expect(cfg).toContain('UIFileSharingEnabled: true');
  });
});
