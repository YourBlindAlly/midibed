import { RHYTHMS, clampRhythm, rhythmDescribe, rhythmMask, rhythmPattern, rhythmText } from '../src/rhythms';
import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';

describe('rhythm library', () => {
  it('has the Euclidean spread first and the standard timelines after it', () => {
    expect(RHYTHMS[0].name).toBe('Euclidean spread');
    const byName = (n: string) => RHYTHMS.find((r) => r.name === n)!;
    expect(byName('Son clave').hits).toEqual([0, 3, 6, 10, 12]);
    expect(byName('Rumba clave').hits).toEqual([0, 3, 7, 10, 12]);
    expect(byName('Bossa nova clave').hits).toEqual([0, 3, 6, 10, 13]);
    expect(byName('Gahu').hits).toEqual([0, 3, 6, 10, 14]);
    expect(byName('Bembe bell, 12 steps').steps).toBe(12);
    expect(byName('Bembe bell, 12 steps').hits).toHaveLength(7);
  });

  it('every pattern fits inside its cycle without repeats', () => {
    for (const r of RHYTHMS.slice(1)) {
      expect(r.steps).toBeGreaterThan(0);
      expect(r.steps).toBeLessThanOrEqual(32);
      expect(new Set(r.hits).size).toBe(r.hits.length);
      expect(r.hits.every((h) => h >= 0 && h < r.steps)).toBe(true);
    }
  });

  it('turns a 3-2 clave into a 2-3 clave with half the steps of rotation', () => {
    const i = RHYTHMS.findIndex((r) => r.name === 'Son clave');
    expect(rhythmText(i, 0)).toBe('x..x..x...x.x...');
    expect(rhythmText(i, 8)).toBe('..x.x...x..x..x.');
    expect(rhythmDescribe(i, 0)).toBe('hits on steps 1, 4, 7, 11, 13 of 16');
    expect(rhythmPattern(i, 0)).toHaveLength(16);
  });

  it('gives a bit mask and keeps the choice inside the list', () => {
    const i = RHYTHMS.findIndex((r) => r.name === 'Backbeat');
    expect(rhythmMask(i)).toBe((1 << 4) | (1 << 12));
    expect(clampRhythm(-1)).toBe(0);
    expect(clampRhythm(99)).toBe(RHYTHMS.length - 1);
  });

  it('reaches the engine as a mask with its own steps, and is saved per scene', () => {
    const son = RHYTHMS.findIndex((r) => r.name === 'Son clave');
    const s = { ...defaultState, drums: defaultState.drums.map((d, i) => (i === 1 ? { ...d, rhythm: son, steps: 16, hits: 2 } : d)) };
    const j = JSON.parse(toEngineJson(s)).drums;
    expect(j[1]).toMatchObject({ steps: 16, hits: 5, useMask: true, mask: rhythmMask(son) });
    expect(j[0]).toMatchObject({ useMask: false, mask: 0 });
    expect(switchScene(switchScene(s, 1), 0).drums[1].rhythm).toBe(son);
    expect(switchScene(s, 1).drums[1].rhythm).toBe(0);
    expect(migrateState({ drums: [{ name: 'Kick', steps: 16, hits: 4 }] }).drums[0].rhythm).toBe(0);
  });
});
