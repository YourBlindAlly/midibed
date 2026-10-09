import { defaultState, migrateState, sceneConfigsJson, switchScene, toEngineJson } from '../src/config';

describe('auto-advance settings', () => {
  it('every scene stays where it is until told otherwise', () => {
    expect(defaultState.advance.mode).toBe(0);
    expect(defaultState.scenes.every((sc) => sc.advance.mode === 0)).toBe(true);
    expect(JSON.parse(toEngineJson(defaultState)).advance).toMatchObject({ mode: 0, bars: 0 });
  });

  it('is sent to the engine as a number of bars and a target scene', () => {
    // 2 chord loops of 8 bars (2 bars per chord x 4 chords) = 16 bars, then the next scene
    const live = { ...defaultState, advance: { mode: 1, count: 2, unit: 1, target: 0 } };
    const j = JSON.parse(toEngineJson(live));
    expect(j.advance).toEqual({ mode: 1, bars: 16, target: 1 });
    expect(j.sceneIndex).toBe(0);
    const bars = { ...defaultState, advance: { mode: 2, count: 12, unit: 0, target: 3 } };
    expect(JSON.parse(toEngineJson(bars)).advance).toEqual({ mode: 2, bars: 12, target: 3 });
  });

  it('belongs to each scene', () => {
    const live = { ...defaultState, advance: { mode: 3, count: 4, unit: 0, target: 0 } };
    const away = switchScene(live, 2);
    expect(away.advance.mode).toBe(0);
    expect(switchScene(away, 0).advance).toEqual({ mode: 3, count: 4, unit: 0, target: 0 });
  });

  it('old saved settings get the defaults', () => {
    const s = migrateState({ bpm: 90 });
    expect(s.advance.mode).toBe(0);
    expect(s.scenes.every((sc) => sc.advance.mode === 0)).toBe(true);
  });
});

describe('freeze', () => {
  it('is sent to the engine', () => {
    expect(JSON.parse(toEngineJson({ ...defaultState, frozen: true })).frozen).toBe(true);
    expect(JSON.parse(toEngineJson(defaultState)).frozen).toBe(false);
  });

  it('is never saved as on: the app always starts unfrozen', () => {
    expect(migrateState({ frozen: true }).frozen).toBe(false);
  });

  it('is global: it is not part of a scene', () => {
    expect(Object.keys(defaultState.scenes[0])).not.toContain('frozen');
    expect(switchScene({ ...defaultState, frozen: true }, 1).frozen).toBe(true);
  });
});

describe('every scene as a full configuration for the engine', () => {
  it('gives one configuration per scene, each knowing which scene it is', () => {
    const all = JSON.parse(sceneConfigsJson(defaultState));
    expect(all).toHaveLength(4);
    expect(all.map((c: { sceneIndex: number }) => c.sceneIndex)).toEqual([0, 1, 2, 3]);
  });

  it('each one carries its own scene settings but the shared global ones', () => {
    const all = JSON.parse(sceneConfigsJson({ ...defaultState, bpm: 101 }));
    expect(all.every((c: { bpm: number }) => c.bpm === 101)).toBe(true);
    // scene 4 (drone only) has the pad off and no drums; scene 1 has both
    expect(all[3].pad.enabled).toBe(false);
    expect(all[0].pad.enabled).toBe(true);
    expect(all[3].drums.every((d: { enabled: boolean }) => !d.enabled)).toBe(true);
  });

  it('uses the live settings for the scene being played, not its older saved copy', () => {
    const live = { ...defaultState, swing: 77 };
    const all = JSON.parse(sceneConfigsJson(live));
    expect(all[0].swing).toBeCloseTo(0.77);
    expect(all[1].swing).toBeCloseTo(defaultState.scenes[1].swing / 100);
  });

  it('marks each configuration with its own auto-advance target', () => {
    const live = { ...defaultState, scenes: defaultState.scenes.map((sc) => ({ ...sc, advance: { mode: 1, count: 4, unit: 0, target: 0 } })) };
    const all = JSON.parse(sceneConfigsJson({ ...live, advance: live.scenes[0].advance }));
    expect(all.map((c: { advance: { target: number } }) => c.advance.target)).toEqual([1, 2, 3, 0]);
  });
});
