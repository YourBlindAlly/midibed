import { defaultState, migrateState, toEngineJson } from '../src/config';

describe('fades and drum filter settings', () => {
  it('sends fade times to the engine in seconds', () => {
    const j = JSON.parse(toEngineJson({ ...defaultState, fade: { ...defaultState.fade, droneIn: 65, padOut: 5 } }));
    expect(j.fade.cc).toBe(11);
    expect(j.fade.droneIn).toBeCloseTo(6.5);
    expect(j.fade.padOut).toBeCloseTo(0.5);
    expect(j.fade.drumOut).toBeCloseTo(2);
  });

  it('defaults to a slow fade in and a shorter fade out for drone and pad', () => {
    expect(defaultState.fade.droneIn).toBeGreaterThan(defaultState.fade.droneOut);
    expect(defaultState.fade.padIn).toBeGreaterThan(defaultState.fade.padOut);
  });

  it('has a drum-channel cutoff wanderer that is off by default', () => {
    const drumCutoff = defaultState.wanderers.find((w) => w.name === 'Drum cutoff');
    expect(drumCutoff).toBeDefined();
    expect(drumCutoff?.channel).toBe(9);
    expect(drumCutoff?.cc).toBe(74);
    expect(drumCutoff?.enabled).toBe(false);
  });

  it('upgrades old saved settings that had no fades and two wanderers', () => {
    const old = { bpm: 100, wanderers: [{ name: 'Cutoff', cc: 74, min: 5 }, { name: 'Resonance' }] };
    const s = migrateState(old);
    expect(s.fade.droneIn).toBe(defaultState.fade.droneIn);
    expect(s.wanderers).toHaveLength(3);
    expect(s.wanderers[0].min).toBe(5);
    expect(s.wanderers[2].name).toBe('Drum cutoff');
  });
});
