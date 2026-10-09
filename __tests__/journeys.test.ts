import {
  MAX_JOURNEYS,
  defaultState,
  deleteJourney,
  duplicateJourney,
  keyRoot,
  migrateState,
  newJourney,
  padChords,
  droneChords,
  relativeKey,
  renameJourney,
  switchJourney,
  switchScene,
  toEngineJson,
  wrapOffset,
} from '../src/config';

const pcs = (notes: number[]) => [...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b);

describe('journeys', () => {
  it('start as a single journey holding the current settings', () => {
    expect(defaultState.journeys).toHaveLength(1);
    expect(defaultState.journeyName).toBe('Journey 1');
    expect(defaultState.journeys[0].root).toBe(38);
    expect(defaultState.journeys[0].scenes).toHaveLength(4);
  });

  it('a new journey has fresh scenes and keeps the key and tempo', () => {
    const edited = { ...defaultState, bpm: 70, drone: { ...defaultState.drone, root: 32 } };
    const s = newJourney(edited);
    expect(s.journeys).toHaveLength(2);
    expect(s.activeJourney).toBe(1);
    expect(s.journeyName).toBe('Journey 2');
    expect(s.bpm).toBe(70);
    expect(s.drone.root).toBe(32);
    expect(s.activeScene).toBe(0);
  });

  it('switching saves edits to the journey being left and restores them on return', () => {
    let s = newJourney(defaultState);
    s = { ...s, bpm: 120, drone: { ...s.drone, root: 31 }, swing: 40 };
    s = renameJourney(s, 'Flute');
    s = switchScene(s, 2);
    const back = switchJourney(s, 0);
    expect(back.journeyName).toBe('Journey 1');
    expect(back.bpm).toBe(88);
    expect(back.drone.root).toBe(38);
    expect(back.activeScene).toBe(0);
    const again = switchJourney(back, 1);
    expect(again.journeyName).toBe('Flute');
    expect(again.bpm).toBe(120);
    expect(again.drone.root).toBe(31);
    expect(again.activeScene).toBe(2);
  });

  it('does not touch the global routing when switching', () => {
    const base = { ...defaultState, drone: { ...defaultState.drone, channel: 4 } };
    const s = switchJourney(newJourney(base), 0);
    expect(s.drone.channel).toBe(4);
  });

  it('keeps sound choices per journey', () => {
    let s = newJourney(defaultState);
    s = { ...s, sounds: s.sounds.map((sl, i) => (i === 2 ? { ...sl, program: 99 } : sl)) };
    const back = switchJourney(s, 0);
    expect(back.sounds[2].program).toBe(12);
    expect(switchJourney(back, 1).sounds[2].program).toBe(99);
  });

  it('duplicates with unsaved edits, deletes, and never deletes the last one', () => {
    let s = { ...defaultState, bpm: 101 };
    s = duplicateJourney(s);
    expect(s.journeys).toHaveLength(2);
    expect(s.journeyName).toBe('Journey 1 copy');
    expect(s.journeys[0].bpm).toBe(101);
    expect(s.bpm).toBe(101);
    s = deleteJourney(s);
    expect(s.journeys).toHaveLength(1);
    expect(s.journeyName).toBe('Journey 1');
    expect(deleteJourney(s)).toBe(s);
  });

  it('is capped', () => {
    let s = defaultState;
    for (let i = 0; i < MAX_JOURNEYS + 3; i++) s = newJourney(s);
    expect(s.journeys).toHaveLength(MAX_JOURNEYS);
  });
});

describe('per scene key', () => {
  it('wraps offsets to -6..5', () => {
    expect(wrapOffset(6)).toBe(-6);
    expect(wrapOffset(-7)).toBe(5);
    expect(wrapOffset(3)).toBe(3);
    expect(wrapOffset(15)).toBe(3);
  });

  it('moves the chords sent to the engine', () => {
    const up = { ...defaultState, keyOffset: 3 };
    expect(keyRoot(up)).toBe(41);
    expect(pcs(droneChords(up).flat())).not.toEqual(pcs(droneChords(defaultState).flat()));
    expect(JSON.parse(toEngineJson(up)).drone.chords).toEqual(droneChords(up));
  });

  it('is saved in each scene', () => {
    const away = switchScene({ ...defaultState, keyOffset: 3 }, 1);
    expect(away.keyOffset).toBe(0);
    expect(switchScene(away, 0).keyOffset).toBe(3);
  });

  it('relative major keeps exactly the same chords, with the home note moved', () => {
    const minor = {
      ...defaultState,
      harmony: { ...defaultState.harmony, mode: 5, preset: 5, degrees: [1, 7, 4, 7], count: 4 },
      pad: { ...defaultState.pad, follow: true, style: 0 },
      drone: { ...defaultState.drone, root: 32, follow: true, octave: false, fifth: false },
    };
    const major = relativeKey(minor);
    expect(major.harmony.mode).toBe(0);
    expect(major.keyOffset).toBe(3);
    expect(major.harmony.degrees).toEqual([6, 5, 2, 5]);
    expect(major.harmony.preset).toBe(0);
    const before = padChords(minor).map(pcs);
    const after = padChords(major).map(pcs);
    expect(after).toEqual(before);
    expect(droneChords(major).map(pcs)).toEqual(droneChords(minor).map(pcs));
    // and back again
    const back = relativeKey(major);
    expect(back.harmony.mode).toBe(5);
    expect(back.keyOffset).toBe(0);
    expect(back.harmony.degrees).toEqual([1, 7, 4, 7]);
  });

  it('leaves other modes alone', () => {
    expect(relativeKey(defaultState)).toBe(defaultState); // Dorian
  });
});

describe('saving journeys', () => {
  it('wraps settings saved before journeys existed into Journey 1', () => {
    const s = migrateState({ bpm: 77, drone: { root: 40 } });
    expect(s.journeys).toHaveLength(1);
    expect(s.journeys[0]).toMatchObject({ name: 'Journey 1', bpm: 77, root: 40 });
    expect(s.keyOffset).toBe(0);
    expect(s.scenes.every((sc) => sc.keyOffset === 0)).toBe(true);
  });

  it('keeps every saved journey and the active one', () => {
    let s = newJourney(defaultState);
    s = renameJourney({ ...s, bpm: 130 }, 'Fast one');
    s = newJourney(s);
    const round = migrateState(JSON.parse(JSON.stringify(s)));
    expect(round.journeys).toHaveLength(3);
    expect(round.activeJourney).toBe(2);
    expect(round.journeys[1]).toMatchObject({ name: 'Fast one', bpm: 130 });
    const first = switchJourney(round, 1);
    expect(first.journeyName).toBe('Fast one');
    expect(first.bpm).toBe(130);
  });

  it('survives garbage in a stored journey', () => {
    const s = migrateState({ journeys: [{}, 'x', null], activeJourney: 7 });
    expect(s.journeys).toHaveLength(3);
    expect(s.activeJourney).toBe(2);
    expect(switchJourney(s, 0).scenes).toHaveLength(4);
  });
});
