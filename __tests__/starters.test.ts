import { defaultState, keyRoot, applyScene, toEngineJson, migrateState, MAX_JOURNEYS } from '../src/config';
import { chordLabel } from '../src/chords';
import { RHYTHMS } from '../src/rhythms';
import { STARTER_JOURNEYS, addStarterJourney } from '../src/starters';

const labels = (s: ReturnType<typeof addStarterJourney>) =>
  s.harmony.degrees.slice(0, s.harmony.count).map((d, i) => chordLabel(keyRoot(s), s.harmony.mode, d, s.pad.style, s.harmony.colors[i]));

describe('Go with Guitar starter journey', () => {
  const added = addStarterJourney(defaultState, 0);

  it('is added after the others at 80 BPM with four scenes', () => {
    expect(added.journeys.length).toBe(2);
    expect(added.activeJourney).toBe(1);
    expect(added.journeyName).toBe('Go with Guitar');
    expect(added.bpm).toBe(80);
    expect(added.scenes.length).toBe(4);
  });

  it('plays the right chords in each scene (A minor home)', () => {
    const at = (i: number) => applyScene(added, added.scenes[i]);
    expect(labels(at(0)).length).toBe(1);
    expect(labels(at(0))[0]).toMatch(/^A/);
    const names = (i: number) => labels(at(i)).map((l) => l.split(' ')[0]);
    expect(names(1)).toEqual(['F', 'G', 'A', 'A']);
    expect(names(2)).toEqual(['D', 'C', 'G', 'G']);
    expect(labels(at(3)).length).toBe(1);
  });

  it('sets the drum intro, the kick and the breathing', () => {
    const s1 = applyScene(added, added.scenes[0]);
    expect(s1.motion.drums.introBars).toBe(16);
    const kick = s1.drums.find((d) => d.name === 'Kick')!;
    expect(RHYTHMS[kick.rhythm].hits).toEqual([0, 5, 8]);
    expect(kick.accentEvery).toBe(3);
    expect(kick.accentOffset).toBe(1);
    expect(s1.drums.find((d) => d.name === 'Snare')!.enabled).toBe(false);
    const s2 = applyScene(added, added.scenes[1]);
    expect(s2.drums.find((d) => d.name === 'Snare')!.enabled).toBe(true);
    expect(s2.motion.drums.style).toBe(0);
    const s3 = applyScene(added, added.scenes[2]);
    expect(s3.motion.drums.style).toBe(1);
    expect(s3.motion.pad.baseBars).toBeGreaterThan(0);
    expect(JSON.parse(toEngineJson(s1)).motion.drums.introBars).toBe(16);
  });

  it('a second add gets a new name, and the limit is respected', () => {
    const twice = addStarterJourney(added, 0);
    expect(twice.journeyName).toBe('Go with Guitar 2');
    let s = defaultState;
    for (let i = 0; i < MAX_JOURNEYS + 2; i++) s = addStarterJourney(s, 0);
    expect(s.journeys.length).toBe(MAX_JOURNEYS);
    expect(STARTER_JOURNEYS.length).toBeGreaterThan(0);
  });
});

it('scene 3: bass and pad both go steady together', () => {
  const s3 = applyScene(addStarterJourney(defaultState, 0), addStarterJourney(defaultState, 0).scenes[2]);
  expect(s3.motion.bass).toMatchObject({ baseBars: 8, altBars: 8, kind: 0 });
  expect(s3.motion.pad).toMatchObject({ baseBars: 8, altBars: 8, kind: 0 });
  expect(s3.drone.follow).toBe(true);
});

describe('E and C starter journey', () => {
  const added = addStarterJourney(defaultState, 1);
  const names = (i: number) => {
    const s = applyScene(added, added.scenes[i]);
    return s.harmony.degrees.slice(0, s.harmony.count).map((d, k) => chordLabel(keyRoot(s), s.harmony.mode, d, s.pad.style, s.harmony.colors[k]));
  };
  it('is 85 BPM on E and plays E major and C major', () => {
    expect(added.journeyName).toBe('E and C');
    expect(added.bpm).toBe(85);
    expect(added.drone.root % 12).toBe(4);
    expect(names(0)).toHaveLength(1);
    expect(names(0)[0]).toMatch(/^E/);
    expect(names(0)[0]).toBe('E major');
    expect(names(1).map((l) => l.split(' ')[0])).toEqual(['E', 'C']);
    expect(names(2).map((l) => l.split(' ')[0])).toEqual(['C', 'E', 'C', 'E']);
  });
  it('has the drum intro and steady scene 3 breathing', () => {
    expect(applyScene(added, added.scenes[0]).motion.drums.introBars).toBe(16);
    const s3 = applyScene(added, added.scenes[2]);
    expect(s3.motion.bass.baseBars).toBe(8);
    expect(s3.motion.pad.baseBars).toBe(8);
  });
});

describe('Flute G# minor B starter journey', () => {
  const added = addStarterJourney(defaultState, 2);
  const at = (i: number) => applyScene(added, added.scenes[i]);
  const names = (i: number) => {
    const s = at(i);
    return s.harmony.degrees.slice(0, s.harmony.count).map((d, k) => chordLabel(keyRoot(s), s.harmony.mode, d, s.pad.style, s.harmony.colors[k]));
  };
  it('is 90 BPM with the right chords, two bars each', () => {
    expect(added.bpm).toBe(90);
    expect(names(0)[0].startsWith('G#')).toBe(true);
    expect(names(2)[1]).toBe('G# minor');
    expect(names(1)[0].startsWith('B')).toBe(true);
    expect(names(2)[0]).toBe('B major');
    expect(names(2).map((l) => l.split(' ')[0])).toEqual(['B', 'G#', 'C#', 'G#', 'B', 'G#', 'C#', 'G#', 'F#']);
    expect(names(2)[8]).toBe('F# major');
    expect(names(3).map((l) => l.split(' ')[0])).toEqual(['G#', 'E', 'B', 'F#']);
    expect(at(2).harmony.barsPerChord).toBe(2);
  });
  it('drone scenes are steady with wandering soft hand drums', () => {
    for (const i of [0, 1]) {
      const s = at(i);
      expect(s.drone.follow).toBe(false);
      expect(s.pad.follow).toBe(false);
      expect(s.evolve.everyBars).toBe(4);
      expect(s.drums.find((d) => d.name === 'Kick')!.enabled).toBe(false);
      expect(s.drums.find((d) => d.name === 'Low tom')!.enabled).toBe(true);
    }
  });
});

describe('twelve chords in a progression', () => {
  it('a 9-chord scene plays nine chords of two bars each and keeps all of them', () => {
    const added = addStarterJourney(defaultState, 2);
    const s = applyScene(added, added.scenes[2]);
    expect(s.harmony.count).toBe(9);
    expect(s.harmony.degrees).toHaveLength(12);
    const j = JSON.parse(toEngineJson(s));
    expect(j.harmony).toEqual({ barsPerChord: 2, count: 9 });
    expect(j.drone.chords).toHaveLength(9);
    expect(j.pad.chords).toHaveLength(9);
  });
  it('old saved four-chord settings grow to twelve slots without changing', () => {
    const old: any = JSON.parse(JSON.stringify(defaultState));
    old.harmony.degrees = [1, 4, 5, 6];
    old.harmony.colors = [1, 0, 2, 0];
    const m = migrateState(old);
    expect(m.harmony.degrees.slice(0, 4)).toEqual([1, 4, 5, 6]);
    expect(m.harmony.colors.slice(0, 4)).toEqual([1, 0, 2, 0]);
    expect(m.harmony.degrees).toHaveLength(12);
  });
  it('the two-chord flute journey cycles between two chords', () => {
    const added = addStarterJourney(defaultState, 3);
    expect(added.journeyName).toBe('Flute two-chord cycles');
    const s3 = applyScene(added, added.scenes[2]);
    const s4 = applyScene(added, added.scenes[3]);
    expect([s3.harmony.count, s3.harmony.degrees[0], s3.harmony.degrees[1]]).toEqual([2, 3, 1]);
    expect([s4.harmony.count, s4.harmony.degrees[0], s4.harmony.degrees[1]]).toEqual([2, 4, 1]);
    expect(applyScene(added, added.scenes[0]).evolve.everyBars).toBe(4);
  });
});

describe('Ocarina modal starter journeys (all notes of C major)', () => {
  const whiteNotes = new Set([0, 2, 4, 5, 7, 9, 11]);
  const cases: [number, string, string, number, string[], string[]][] = [
    [4, 'Ocarina Dorian', 'D', 88, ['D', 'G'], ['D', 'C', 'G', 'C']],
    [5, 'Ocarina Mixolydian', 'G', 92, ['G', 'F'], ['G', 'F', 'C', 'F']],
    [6, 'Ocarina Aeolian', 'A', 80, ['A', 'G'], ['A', 'F', 'C', 'G']],
    [7, 'Ocarina Lydian', 'F', 84, ['F', 'G'], ['F', 'G', 'C', 'G']],
  ];
  it.each(cases)('journey %i %s: tempo, chords, and no notes outside C major', (idx, name, tonic, bpm, flip, turn) => {
    const added = addStarterJourney(defaultState, idx);
    expect(added.journeyName).toBe(name);
    expect(added.bpm).toBe(bpm);
    const lab = (i: number) => {
      const s = applyScene(added, added.scenes[i]);
      return s.harmony.degrees.slice(0, s.harmony.count).map((d, k) => chordLabel(keyRoot(s), s.harmony.mode, d, 0, s.harmony.colors[k]).split(' ')[0]);
    };
    expect(lab(0)).toEqual([tonic]);
    expect(lab(1)).toEqual(flip);
    expect(lab(2)).toEqual(turn);
    expect(lab(3)).toEqual([tonic]);
    for (let i = 0; i < 4; i++) {
      const s = applyScene(added, added.scenes[i]);
      const j = JSON.parse(toEngineJson(s));
      for (const list of [...j.drone.chords, ...j.pad.chords] as number[][]) {
        for (const n of list) expect(whiteNotes.has(n % 12)).toBe(true);
      }
    }
    const s4 = applyScene(added, added.scenes[3]);
    expect(s4.drums.filter((d) => d.enabled).length).toBeGreaterThanOrEqual(6);
    expect(applyScene(added, added.scenes[0]).drums.find((d) => d.name === 'Kick')!.enabled).toBe(false);
  });
});
