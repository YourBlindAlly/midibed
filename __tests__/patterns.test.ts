import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';

describe('pattern extras: ghost notes, accents, keep first, looseness, evolving', () => {
  it('start off, so existing sounds do not change', () => {
    for (const d of defaultState.drums) {
      expect(d).toMatchObject({ ghostHits: 0, ghostRotation: 0, ghostVelocity: 40, accentEvery: 0, accentBoost: 30, keepFirst: false, looseMs: 0 });
    }
    expect(defaultState.evolve).toEqual({ everyBars: 0, chance: 50, returnAfter: 4 });
  });

  it('reach the engine in its units', () => {
    const drums = defaultState.drums.map((d, i) => (i === 1 ? { ...d, ghostHits: 40, accentEvery: 2, accentBoost: 25, keepFirst: true, looseMs: 12 } : d));
    const j = JSON.parse(toEngineJson({ ...defaultState, drums, evolve: { everyBars: 4, chance: 60, returnAfter: 3 } }));
    expect(j.drums[1]).toMatchObject({ ghostHits: 16, accentEvery: 2, accentBoost: 0.25, keepFirst: true, looseMs: 12 }); // ghost hits cannot exceed the steps
    expect(j.evolve).toEqual({ everyBars: 4, chance: 0.6, returnAfter: 3 });
  });

  it('are saved per scene', () => {
    const drums = defaultState.drums.map((d, i) => (i === 0 ? { ...d, keepFirst: true } : d));
    const s = switchScene(switchScene({ ...defaultState, drums, evolve: { ...defaultState.evolve, everyBars: 8 } }, 1), 0);
    expect(s.drums[0].keepFirst).toBe(true);
    expect(s.evolve.everyBars).toBe(8);
    expect(switchScene({ ...defaultState, evolve: { ...defaultState.evolve, everyBars: 8 } }, 1).evolve.everyBars).toBe(0);
  });

  it('are filled in for settings saved before they existed', () => {
    const s = migrateState({ drums: [{ name: 'Kick', steps: 16, hits: 4 }] });
    expect(s.drums[0]).toMatchObject({ ghostHits: 0, accentEvery: 0, keepFirst: false, looseMs: 0 });
    expect(s.evolve).toEqual(defaultState.evolve);
    expect(s.scenes[0].drums[0]).toMatchObject({ ghostHits: 0, keepFirst: false });
  });
});

describe('silencing the drum patterns', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require('../src/config');

  it('sets every drum to no hits, no library rhythm and no ghost notes, and leaves the rest', () => {
    const s = {
      ...defaultState,
      drums: defaultState.drums.map((d, i) => (i === 1 ? { ...d, rhythm: 2, ghostHits: 5 } : d)),
    };
    const out = cfg.silenceDrumPatterns(s);
    expect(out.drums.every((d: { hits: number; rhythm: number; ghostHits: number }) => d.hits === 0 && d.rhythm === 0 && d.ghostHits === 0)).toBe(true);
    expect(out.drums[0].steps).toBe(s.drums[0].steps);
    expect(out.drums[0].enabled).toBe(s.drums[0].enabled);
    expect(out.drums[0].note).toBe(s.drums[0].note);
    expect(JSON.parse(toEngineJson(out)).drums.every((d: { hits: number }) => d.hits === 0)).toBe(true);
  });

  it('can be undone from the remembered patterns', () => {
    const s = { ...defaultState, drums: defaultState.drums.map((d, i) => (i === 1 ? { ...d, rhythm: 2, ghostHits: 5 } : d)) };
    const memory = cfg.rememberDrumPatterns(s);
    const back = cfg.restoreDrumPatterns(cfg.silenceDrumPatterns(s), memory);
    expect(back.drums.map((d: { hits: number; rhythm: number; ghostHits: number }) => [d.hits, d.rhythm, d.ghostHits])).toEqual(
      s.drums.map((d) => [d.hits, d.rhythm, d.ghostHits]),
    );
  });
});
