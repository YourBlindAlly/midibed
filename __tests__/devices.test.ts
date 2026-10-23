// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
import { defaultState } from '../src/config';

describe('saying when a MIDI device connects or goes away', () => {
  it('is on by default and saved with the pedal settings', () => {
    expect(defaultState.midiControl.announceDevices).toBe(true);
  });

  it('the engine compares the sources each time something changes and tells the screen, but not for those at start-up', () => {
    const e = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(e).toContain('for (ref, name) in current where before[ref] == nil');
    expect(e).toContain('for (ref, name) in before where current[ref] == nil');
    expect(e).toContain('guard primed else { return }');
    expect(e).toContain('kMIDIPropertyDisplayName');
    const m = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngineModule.swift', 'utf8');
    expect(m).toContain('"onMidiDevice"');
    expect(m).toContain('Function("midiDevices")');
  });

  it('the screen holds a disconnect back for a moment so a blip is not announced, and lists the devices on Setup', () => {
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('pendingDisconnect');
    expect(app).toContain('}, 700);');
    expect(app).toContain('MIDI devices connected:');
    expect(app).toContain('Say when a MIDI device connects or disconnects');
  });
});
