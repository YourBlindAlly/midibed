import { defaultState, keyRoot, applyScene, toEngineJson, MAX_JOURNEYS } from '../src/config';
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
