import { defaultState, migrateState, toEngineJson, switchScene } from '../src/config';

describe('per-part outputs', () => {
  it('default to everything on, for MIDI and the built-in sound', () => {
    for (const part of ['bass', 'pad', 'dancer', 'drums', 'loops'] as const) {
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
