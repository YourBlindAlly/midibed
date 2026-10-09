import { buildBassChords, chordLabel } from '../src/chords';
import { defaultState, droneChords, migrateState, padChords, switchScene, toEngineJson } from '../src/config';

const pcs = (notes: number[]) => notes.map((n) => n % 12).sort((a, b) => a - b);

describe('bass follows chords', () => {
  const base = { root: 38, mode: 1, degrees: [1, 7, 4, 7], count: 4, follow: true, octave: false, fifth: false };

  it('plays the root of each chord, kept near the drone root', () => {
    const chords = buildBassChords(base);
    expect(chords).toEqual([[38], [36], [43], [36]]); // D, C (below, not a seventh up), G, C
    chords.flat().forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(38 - 5);
      expect(n).toBeLessThanOrEqual(38 + 6);
    });
  });

  it('stays on the key root, as one steady list, when not following', () => {
    expect(buildBassChords({ ...base, follow: false })).toEqual([[38]]);
  });

  it('adds the octave and the fifth to each chord', () => {
    const chords = buildBassChords({ ...base, octave: true, fifth: true });
    expect(chords[0]).toEqual([38, 50, 45]); // D, D, A
    expect(chords[1]).toEqual([36, 48, 43]); // C, C, G
  });

  it('a root and fifth drone is the fifth without the octave', () => {
    expect(buildBassChords({ ...base, follow: false, fifth: true })).toEqual([[38, 45]]);
  });

  it('gives a diminished chord its diminished fifth when following, but a steady drone always a perfect fifth', () => {
    // D major (Ionian): degree 7 is C# diminished (C# E G). The bass root C# folds to 37.
    const following = buildBassChords({ ...base, mode: 0, fifth: true, degrees: [7], count: 1 });
    expect(following[0]).toEqual([37, 43]); // C# and G: a diminished fifth
    const steady = buildBassChords({ ...base, mode: 0, fifth: true, follow: false });
    expect(steady[0]).toEqual([38, 45]); // a steady drone keeps its perfect fifth
  });

  it('is sent to the engine one list per chord when following, one list when not', () => {
    const live = { ...defaultState, drone: { ...defaultState.drone, follow: true, octave: false, fifth: false } };
    expect(droneChords(live)).toHaveLength(4);
    expect(JSON.parse(toEngineJson(live)).drone.chords).toEqual([[38], [36], [43], [36]]);
    expect(JSON.parse(toEngineJson(defaultState)).drone.chords).toHaveLength(1);
  });
});

describe('fifths pad', () => {
  it('has a Fifth only chord type that plays just the root and the fifth', () => {
    const live = { ...defaultState, pad: { ...defaultState.pad, follow: false, style: 6, voiceLead: false } };
    const chords = padChords(live);
    expect(chords).toHaveLength(1);
    expect(chords[0]).toHaveLength(2);
    expect(pcs(chords[0])).toEqual([2, 9]); // D and A
    expect(chordLabel(38, 1, 1, 6)).toBe('D and A');
  });

  it('plays one steady chord when not following, and the whole loop when following', () => {
    expect(padChords({ ...defaultState, pad: { ...defaultState.pad, follow: false } })).toHaveLength(1);
    expect(padChords(defaultState)).toHaveLength(4);
  });

  it('a following fifths pad moves with the chords', () => {
    const live = { ...defaultState, pad: { ...defaultState.pad, follow: true, style: 6 } };
    const chords = padChords(live);
    expect(chords).toHaveLength(4);
    expect(pcs(chords[1])).toEqual([0, 7]); // C and G
  });
});

describe('harmony settings', () => {
  it('sends the chord loop timing to the engine separately from the pad', () => {
    const j = JSON.parse(toEngineJson(defaultState));
    expect(j.harmony).toEqual({ barsPerChord: 2, count: 4 });
    expect(j.pad.barsPerChord).toBeUndefined();
  });

  it('is saved in each scene', () => {
    const away = switchScene(defaultState, 2); // the lift scene is Mixolydian
    expect(away.harmony.mode).toBe(4);
    expect(away.drone.follow).toBe(true);
    const back = switchScene(away, 0);
    expect(back.harmony.mode).toBe(1);
    expect(back.drone.follow).toBe(false);
  });

  it('carries chord settings saved inside the pad by older versions over to the harmony', () => {
    const legacy = {
      bpm: 100,
      pad: { enabled: true, mode: 4, preset: 3, count: 2, degrees: [1, 4, 4, 7], barsPerChord: 3, style: 1 },
      scenes: [
        { pad: { mode: 5, preset: 0, count: 3, degrees: [1, 6, 7, 7], barsPerChord: 1 } },
        { swing: 20 },
      ],
      activeScene: 1,
    };
    const s = migrateState(legacy);
    expect(s.harmony).toEqual({ mode: 4, preset: 3, count: 2, degrees: [1, 4, 4, 7], barsPerChord: 3 });
    expect(s.pad.style).toBe(1);
    expect(s.pad).not.toHaveProperty('mode');
    expect(s.pad.follow).toBe(true);
    expect(s.scenes[0].harmony).toEqual({ mode: 5, preset: 0, count: 3, degrees: [1, 6, 7, 7], barsPerChord: 1 });
    expect(s.scenes[0]).not.toHaveProperty('pad.mode');
  });

  it('does not overwrite settings that already use the new shape', () => {
    const s = migrateState({ harmony: { mode: 2 }, pad: { mode: 5 } });
    expect(s.harmony.mode).toBe(2);
  });
});
