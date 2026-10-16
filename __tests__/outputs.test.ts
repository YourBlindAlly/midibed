import { defaultState, migrateState, toEngineJson, switchScene } from '../src/config';
declare const __dirname: string;

describe('per-part outputs', () => {
  it('default to everything on, for MIDI and the built-in sound', () => {
    for (const part of ['bass', 'pad', 'dancer', 'drums', 'loops', 'keys'] as const) {
      expect(defaultState.outputs[part]).toEqual({ midi: true, synth: true });
    }
  });

  it('reach the engine as they are set', () => {
    const s = { ...defaultState, outputs: { ...defaultState.outputs, dancer: { midi: true, synth: false }, drums: { midi: false, synth: true } } };
    const j = JSON.parse(toEngineJson(s));
    expect(j.outputs.dancer).toEqual({ midi: true, synth: false });
    expect(j.outputs.drums).toEqual({ midi: false, synth: true });
    expect(j.outputs.bass).toEqual({ midi: true, synth: true });
  });

  it('are global: a scene switch does not change them', () => {
    const s = { ...defaultState, outputs: { ...defaultState.outputs, dancer: { midi: true, synth: false } } };
    expect(switchScene(s, 1).outputs.dancer.synth).toBe(false);
  });

  it('are filled in for settings saved before they existed, and saved values are kept', () => {
    expect(migrateState({}).outputs.pad).toEqual({ midi: true, synth: true });
    const kept = migrateState({ outputs: { dancer: { midi: true, synth: false } } });
    expect(kept.outputs.dancer.synth).toBe(false);
    expect(kept.outputs.bass).toEqual({ midi: true, synth: true });
  });
});

describe('pad voices in the built-in sound', () => {
  it('release a note only on its own channel (a note-off for the same pitch elsewhere must not drop a held fifth)', () => {
    const swift: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'modules', 'midibed-engine', 'ios', 'MidiBedTestSynth.swift'), 'utf8');
    const block = swift.slice(swift.indexOf('private func noteOff'), swift.indexOf('private func allNotesOff'));
    expect(block).toContain('pads[i].channel == channel');
  });
});
