import { defaultState, toEngineJson } from '../src/config';
import { GROOVES, THIN_NAMES, allGrooves, applyGroove, captureGroove, isUserGroove } from '../src/grooves';
import { grooveFileText, loadGrooveFile, removeGroove, saveGroove, syncUserLibrary } from '../src/grooveFile';
import { BUILTIN_RHYTHM_COUNT, RHYTHMS, rhythmMask, registerRhythms } from '../src/rhythms';
import { addStarterJourney } from '../src/starters';

const downtempo = GROOVES.findIndex((g) => g.id === 'downtempo');
const organic = GROOVES.findIndex((g) => g.id === 'organic-world');

describe('keeping the extra drums sparse', () => {
  it('as written changes nothing, and the kick and snare are never touched by it', () => {
    const base = applyGroove(defaultState, downtempo, 0);
    const same = applyGroove(defaultState, downtempo);
    expect(base.drums).toEqual(same.drums);
    for (let level = 1; level <= 4; level++) {
      const out = applyGroove(defaultState, downtempo, level);
      for (const i of [0, 1]) {
        expect(out.drums[i].velocity).toBe(base.drums[i].velocity);
        expect(out.drums[i].probability).toBe(base.drums[i].probability);
        expect(out.drums[i].enabled).toBe(base.drums[i].enabled);
      }
    }
  });

  it('each step plays fewer extras: lower chance, no ghost notes, toms then everything but kick and snare left out', () => {
    const lvl = (n: number) => applyGroove(defaultState, organic, n);
    const onCount = (n: number) => lvl(n).drums.filter((d, i) => i >= 2 && d.enabled).length;
    expect(onCount(0)).toBeGreaterThan(onCount(2));
    expect(onCount(2)).toBeGreaterThanOrEqual(onCount(3));
    expect(onCount(4)).toBe(0);
    expect(lvl(2).drums[7].enabled).toBe(false);
    expect(lvl(2).drums[6].enabled).toBe(false);
    expect(lvl(3).drums[5].enabled).toBe(false);
    expect(lvl(3).drums[4].enabled).toBe(false);
    // a drum that stays gets a lower chance as the level rises
    const chance = (n: number) => lvl(n).drums[3].probability;
    expect(chance(1)).toBeLessThanOrEqual(chance(0));
    expect(chance(3)).toBeLessThan(chance(1));
    expect(lvl(4).drums[0].enabled).toBe(true);
    expect(THIN_NAMES).toHaveLength(5);
  });
});

describe('my grooves', () => {
  it('saving the current drums and applying it gives the same drums back', () => {
    let s = applyGroove(defaultState, organic, 0);
    s = { ...s, drums: s.drums.map((d, i) => (i === 3 ? { ...d, hits: 5, steps: 12, rhythm: 0, rotation: 2 } : d)) };
    const g = captureGroove(s, 'Wobbly');
    const other = applyGroove({ ...defaultState, swing: 0 }, 0);
    const saved = saveGroove(other, g);
    syncUserLibrary(saved);
    const idx = allGrooves().findIndex((x) => x.name === 'Wobbly');
    expect(idx).toBeGreaterThanOrEqual(GROOVES.length);
    expect(isUserGroove(allGrooves()[idx])).toBe(true);
    const back = applyGroove(saved, idx);
    s.drums.forEach((d, i) => {
      const e = back.drums[i];
      expect(e.enabled).toBe(d.enabled);
      if (!d.enabled) return;
      expect(e.rhythm).toBe(d.rhythm);
      expect(e.velocity).toBe(d.velocity);
      expect(e.probability).toBe(d.probability);
      expect(e.rotation).toBe(d.rotation);
      if (d.rhythm === 0) {
        expect(e.hits).toBe(d.hits);
        expect(e.steps).toBe(d.steps);
      }
    });
    expect(back.swing).toBe(s.swing);
    // it can be removed again
    const gone = removeGroove(saved, 'Wobbly');
    syncUserLibrary(gone);
    expect(allGrooves()).toHaveLength(GROOVES.length);
  });

  it('a saved groove with the name of a built-in one takes its place without adding a second', () => {
    const g = captureGroove(defaultState, 'Downtempo');
    const s = saveGroove(defaultState, g);
    syncUserLibrary(s);
    expect(allGrooves()).toHaveLength(GROOVES.length);
    expect(allGrooves()[downtempo].about).toBe(g.about);
    syncUserLibrary(defaultState);
    expect(allGrooves()[downtempo].about).toBe(GROOVES[downtempo].about);
  });
});

describe('a file of grooves, rhythms and journeys', () => {
  const fileOf = (o: unknown) => JSON.stringify({ app: 'MidiBed', grooveFile: 1, ...(o as object) });

  it('adds a rhythm at the END of the library, and a groove that uses it', () => {
    const before = RHYTHMS.length;
    const file = fileOf({
      rhythms: [{ name: 'Test hat A', steps: 16, hits: [2, 6, 10, 14] }, { name: 'Two bars', steps: 32, hits: [0, 31] }],
      grooves: [{ name: 'Test groove A', about: 'for the test', swing: 12, slots: [{ rhythm: 'Beat 1 only', velocity: 70 }, null, { rhythm: 'Test hat A', velocity: 40, chance: 60 }] }],
    });
    const r = loadGrooveFile(defaultState, file);
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('1 groove');
    expect(r.summary).toContain('2 rhythms');
    expect(RHYTHMS.length).toBe(before + 2);
    expect(RHYTHMS.findIndex((x) => x.name === 'Test hat A')).toBeGreaterThanOrEqual(BUILTIN_RHYTHM_COUNT);
    expect(rhythmMask(RHYTHMS.findIndex((x) => x.name === 'Two bars'))).toBe(2 ** 31 + 1);
    syncUserLibrary(r.state);
    const i = allGrooves().findIndex((g) => g.name === 'Test groove A');
    const out = applyGroove(r.state, i);
    expect(out.swing).toBe(12);
    expect(out.drums[2].enabled).toBe(true);
    expect(RHYTHMS[out.drums[2].rhythm].name).toBe('Test hat A');
    expect(out.drums[0].enabled).toBe(true);
    expect(out.drums[1].enabled).toBe(false);
    expect(out.drums[7].enabled).toBe(false);
    // loading again adds nothing new
    expect(loadGrooveFile(r.state, file).summary).toContain('groove updated');
    expect(RHYTHMS.length).toBe(before + 2);
    expect(() => toEngineJson(out)).not.toThrow();
  });

  it('adds journeys after yours without replacing any, renaming a repeated name', () => {
    const withStarter = addStarterJourney(defaultState, 0);
    const exported = grooveFileText(withStarter, 'all');
    const parsed = JSON.parse(exported);
    expect(parsed.journeys).toHaveLength(withStarter.journeys.length);
    const r = loadGrooveFile(withStarter, exported);
    expect(r.ok).toBe(true);
    expect(r.state.journeys).toHaveLength(withStarter.journeys.length * 2);
    // yours are untouched and in the same places
    withStarter.journeys.forEach((j, i) => expect(r.state.journeys[i].name).toBe(j.name));
    const names = r.state.journeys.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
    expect(r.state.activeJourney).toBe(withStarter.activeJourney);
    // a loaded journey is a complete one
    const added = r.state.journeys[r.state.journeys.length - 1];
    expect(added.scenes.length).toBeGreaterThan(0);
    expect(added.scenes[0].drums.length).toBe(withStarter.journeys[0].scenes[0].drums.length);
  });

  it('leaves journeys out when the list is full and says so', () => {
    let s = defaultState;
    for (let i = 0; i < 40; i++) s = addStarterJourney(s, i % 4);
    const r = loadGrooveFile(s, grooveFileText(s, 'all'));
    expect(r.state.journeys.length).toBe(s.journeys.length);
    expect(r.summary).toContain('left out');
  });

  it('turns away a file that is not for MidiBed, and skips what is broken without losing the rest', () => {
    expect(loadGrooveFile(defaultState, 'not json').ok).toBe(false);
    expect(loadGrooveFile(defaultState, JSON.stringify({ hello: 1 })).ok).toBe(false);
    expect(loadGrooveFile(defaultState, JSON.stringify({ app: 'Other', grooves: [] })).ok).toBe(false);
    const r = loadGrooveFile(
      defaultState,
      fileOf({
        grooves: [
          { name: 'Bad rhythm', slots: [{ rhythm: 'No such rhythm', velocity: 50 }] },
          { slots: [] },
          { name: 'Fine', slots: [{ euclid: { hits: 3, steps: 8 }, rhythm: '', velocity: 60 }] },
        ],
        rhythms: [{ name: 'Broken', steps: 16, hits: [3, 40] }],
        journeys: [{ not: 'a journey' }],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('1 groove');
    expect(r.summary).toContain('Skipped');
    syncUserLibrary(r.state);
    expect(allGrooves().some((g) => g.name === 'Fine')).toBe(true);
    expect(allGrooves().some((g) => g.name === 'Bad rhythm')).toBe(false);
    const i = allGrooves().findIndex((g) => g.name === 'Fine');
    const out = applyGroove(r.state, i);
    expect(out.drums[0].rhythm).toBe(0);
    expect(out.drums[0].hits).toBe(3);
    expect(out.drums[0].steps).toBe(8);
  });

  it('registering a rhythm twice, or one with a taken name, adds nothing', () => {
    const n = RHYTHMS.length;
    expect(registerRhythms([{ name: 'Backbeat', steps: 16, hits: [1] }])).toEqual([]);
    expect(RHYTHMS.length).toBe(n);
  });
});
