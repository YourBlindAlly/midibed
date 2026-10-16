import { COLOR_NAMES, buildBassChords, buildPadChords, chordLabel, chordStack, clampColor } from '../src/chords';
import { copyScenePart, defaultState, migrateState, padChords, droneChords, relativeKey, switchScene } from '../src/config';

const E = 64; // E4
const KEY = 40; // E2

describe('chord colour', () => {
  it('has five colours and keeps them inside the list', () => {
    expect(COLOR_NAMES).toEqual(['From the scale', 'Major', 'Minor', 'Sus 2', 'Sus 4']);
    expect([-2, 0, 4, 9].map(clampColor)).toEqual([0, 0, 4, 4]);
    expect(clampColor(Number.NaN)).toBe(0);
  });

  it('is what the scale gives when left alone', () => {
    // E Aeolian: degree 1 = E minor, degree 6 = C major
    expect(chordLabel(E, 5, 1, 0)).toBe('E minor');
    expect(chordLabel(E, 5, 6, 0)).toBe('C major');
    expect(chordStack(E, 5, 1, 0)).toEqual(chordStack(E, 5, 1, 0, 0));
  });

  it('makes E major and C major from E Aeolian: degree 1 forced major, degree 6 from the scale', () => {
    expect(chordLabel(E, 5, 1, 0, 1)).toBe('E major');
    expect(chordStack(E, 5, 1, 0, 1)).toEqual([64, 68, 71]); // E G# B
    expect(chordStack(E, 5, 6, 0, 0)).toEqual([72, 76, 79]); // C E G
  });

  it('forces a minor third, and a sus 2 or sus 4, and always gives a perfect fifth', () => {
    expect(chordStack(E, 0, 1, 0, 2)).toEqual([64, 67, 71]); // E minor from E major
    expect(chordLabel(E, 0, 1, 0, 3)).toBe('E sus 2');
    expect(chordStack(E, 0, 1, 0, 3)).toEqual([64, 66, 71]);
    expect(chordStack(E, 0, 1, 0, 4)).toEqual([64, 69, 71]);
    // the seventh degree of a major scale is diminished; a forced major colour makes it a real major chord
    expect(chordLabel(E, 0, 7, 0)).toContain('diminished');
    expect(chordStack(E, 0, 7, 0, 1)[2] - chordStack(E, 0, 7, 0, 1)[0]).toBe(7);
  });

  it('leaves chord types with no third alone, and keeps the seventh and the ninth', () => {
    expect(chordStack(E, 5, 1, 5, 1)).toEqual(chordStack(E, 5, 1, 5, 0)); // open fifth
    expect(chordStack(E, 5, 1, 6, 2)).toEqual(chordStack(E, 5, 1, 6, 0)); // fifth only
    expect(chordStack(E, 5, 1, 4, 1)).toHaveLength(4); // seventh chord keeps its seventh
    expect(chordStack(E, 5, 1, 3, 1)).toHaveLength(4); // add 9 keeps its ninth
    expect(chordStack(E, 5, 1, 1, 1)).toEqual(chordStack(E, 5, 1, 1, 0)); // a sus 2 chord does not take a third
    expect(chordLabel(E, 5, 1, 1)).toBe('E sus 2');
  });

  it('reaches the pad and the bass in the note lists', () => {
    const params = { root: KEY, mode: 5, degrees: [1, 6, 1, 1], count: 2, style: 0, register: 52, spread: false, voiceLead: false };
    const plain = buildPadChords({ ...params });
    const colored = buildPadChords({ ...params, colors: [1, 0, 0, 0] });
    expect(colored[1]).toEqual(plain[1]);
    expect(colored[0]).not.toEqual(plain[0]);
    const bass = buildBassChords({ root: KEY, mode: 5, degrees: [1, 6, 1, 1], count: 2, colors: [1, 0, 0, 0], follow: true, octave: false, fifth: true });
    expect(bass[0][1] - bass[0][0]).toBe(7);
  });
});

describe('chord colour in the settings', () => {
  it('starts as the scale, in four slots, saved per scene, and survives older settings', () => {
    expect(defaultState.harmony.colors.slice(0, 4)).toEqual([0, 0, 0, 0]);
    const s = switchScene(switchScene({ ...defaultState, harmony: { ...defaultState.harmony, colors: [1, 0, 2, 0] } }, 1), 0);
    expect(s.harmony.colors.slice(0, 4)).toEqual([1, 0, 2, 0]);
    expect(migrateState({ harmony: { mode: 2 } }).harmony.colors.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(migrateState({}).scenes.every((sc) => sc.harmony.colors.length === 12)).toBe(true);
  });

  it('changes the pad and the bass lists, and a relative key switch keeps the colours with their chords', () => {
    const s = { ...defaultState, harmony: { ...defaultState.harmony, mode: 5, degrees: [1, 6, 1, 1], count: 2, colors: [1, 0, 0, 0] } };
    const base = { ...s, harmony: { ...s.harmony, colors: [0, 0, 0, 0] } };
    expect(padChords(s)[0]).not.toEqual(padChords(base)[0]);
    expect(droneChords({ ...s, drone: { ...s.drone, follow: true } })).toHaveLength(2);
    const rel = relativeKey(s);
    expect(rel.harmony.colors).toEqual([1, 0, 0, 0]);
    expect(rel.harmony.mode).toBe(0);
  });

  it('can be copied with the harmony to another scene', () => {
    const s = { ...defaultState, harmony: { ...defaultState.harmony, colors: [1, 2, 0, 0] } };
    const out = copyScenePart(s, 2, 5); // 'Harmony and key change'
    expect(out.scenes[2].harmony.colors).toEqual([1, 2, 0, 0]);
  });
});
