import {
  defaultState,
  droneAltChords,
  droneChords,
  migrateState,
  padAltChords,
  padChords,
  padIsSteadyFifths,
  switchScene,
  toEngineJson,
} from '../src/config';

const pcs = (notes: number[]) => notes.map((n) => n % 12).sort((a, b) => a - b);

describe('breathing: what is sent to the engine', () => {
  it('sends the rules, the drum roles, and an alternate note list for the bass and the pad', () => {
    const j = JSON.parse(toEngineJson(defaultState));
    expect(j.motion.bass).toEqual({ baseBars: 0, altBars: 4, chance: 100 });
    expect(j.motion.drums).toEqual({ baseBars: 0, breakBars: 2, chance: 100, style: 0 });
    expect(j.drums.map((d: { role: string }) => d.role)).toEqual(['kick', 'snare', 'other', 'other']);
    expect(j.drone.altChords.length).toBeGreaterThan(0);
    expect(j.pad.altChords.length).toBeGreaterThan(0);
  });

  it('the bass flips to the opposite of its normal setting', () => {
    const steady = { ...defaultState, drone: { ...defaultState.drone, follow: false, octave: false, fifth: false } };
    expect(droneChords(steady)).toEqual([[38]]);
    expect(droneAltChords(steady)).toEqual([[38], [36], [43], [36]]); // following the chords
    const following = { ...steady, drone: { ...steady.drone, follow: true } };
    expect(droneChords(following)).toEqual([[38], [36], [43], [36]]);
    expect(droneAltChords(following)).toEqual([[38]]);
  });

  it('the pad flips to a steady root-and-fifth drone', () => {
    const alt = padAltChords(defaultState); // normal pad: following full chords
    expect(alt).toHaveLength(1);
    expect(alt[0]).toHaveLength(2);
    expect(pcs(alt[0])).toEqual([2, 9]); // D and A
    expect(padChords(defaultState)).toHaveLength(4);
  });

  it('a pad that is already a steady fifths drone flips to following the chords instead', () => {
    const fifths = { ...defaultState, pad: { ...defaultState.pad, follow: false, style: 6 } };
    expect(padIsSteadyFifths(fifths.pad)).toBe(true);
    expect(padIsSteadyFifths(defaultState.pad)).toBe(false);
    expect(padAltChords(fifths)).toHaveLength(4);
    expect(padChords(fifths)).toHaveLength(1);
  });

  it('keeps the same pad register for the fifths so the flip is a change of notes, not of place', () => {
    const alt = padAltChords(defaultState)[0];
    const normal = padChords(defaultState).flat();
    expect(Math.min(...alt)).toBeGreaterThanOrEqual(defaultState.pad.register);
    expect(Math.max(...alt)).toBeLessThanOrEqual(Math.max(...normal) + 12);
  });
});

describe('breathing: scenes, saving and announcements', () => {
  it('each scene has its own rules', () => {
    const live = { ...defaultState, motion: { ...defaultState.motion, bass: { baseBars: 8, altBars: 4, chance: 75 } } };
    const away = switchScene(live, 1);
    expect(away.motion.bass.baseBars).toBe(0); // scene 2 has its own (off)
    const back = switchScene(away, 0);
    expect(back.motion.bass).toEqual({ baseBars: 8, altBars: 4, chance: 75 });
  });

  it('fills the new settings into old saved settings, with everything off and no announcements', () => {
    const s = migrateState({ bpm: 100 });
    expect(s.motion.bass.baseBars).toBe(0);
    expect(s.motion.pad.baseBars).toBe(0);
    expect(s.motion.drums.baseBars).toBe(0);
    expect(s.announce).toBe(false);
    expect(s.scenes.every((sc) => sc.motion.bass.baseBars === 0)).toBe(true);
  });

  it('keeps announce out of the scenes (it is a global setting)', () => {
    expect(Object.keys(defaultState.scenes[0])).not.toContain('announce');
  });
});
