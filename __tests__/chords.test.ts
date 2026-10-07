import { PRESETS, buildPadChords, chordLabel, chordStack } from '../src/chords';
import { defaultState, migrateState, toEngineJson } from '../src/config';

const pcs = (notes: number[]) => notes.map((n) => n % 12).sort((a, b) => a - b);

describe('modal chords (drone root D = 38)', () => {
  it('builds D Dorian triads on degrees 1, 7, 4', () => {
    expect(pcs(chordStack(38, 1, 1, 0))).toEqual([2, 5, 9]); // D F A
    expect(pcs(chordStack(38, 1, 7, 0))).toEqual([0, 4, 7]); // C E G
    expect(pcs(chordStack(38, 1, 4, 0))).toEqual([2, 7, 11]); // G B D
  });

  it('names chords for speech', () => {
    expect(chordLabel(38, 1, 1, 0)).toBe('D minor');
    expect(chordLabel(38, 1, 7, 0)).toBe('C major');
    expect(chordLabel(38, 5, 2, 0)).toBe('E diminished'); // Aeolian degree 2
    expect(chordLabel(38, 1, 1, 4)).toBe('D minor 7th');
    expect(chordLabel(38, 1, 7, 4)).toBe('C major 7th');
    expect(chordLabel(38, 1, 1, 2)).toBe('D sus 4');
  });

  it('stacks the right tones for each chord type', () => {
    expect(chordStack(38, 1, 1, 1).map((n) => n - 38)).toEqual([0, 2, 7]); // sus 2
    expect(chordStack(38, 1, 1, 3).map((n) => n - 38)).toEqual([0, 3, 7, 14]); // add 9
    expect(chordStack(38, 1, 1, 5).map((n) => n - 38)).toEqual([0, 7, 12]); // open fifth
  });

  const params = { root: 38, mode: 1, degrees: [1, 7, 4, 7], count: 4, style: 0, register: 55, spread: false, voiceLead: true };

  it('voice-leads with small movement and stays in range', () => {
    const chords = buildPadChords(params);
    expect(chords).toHaveLength(4);
    expect(pcs(chords[1])).toEqual([0, 4, 7]);
    for (let i = 1; i < chords.length; i++) {
      const moved = chords[i].map((n, k) => Math.abs(n - chords[i - 1][k]));
      expect(Math.max(...moved)).toBeLessThanOrEqual(5);
    }
    chords.flat().forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(55);
      expect(n).toBeLessThanOrEqual(74);
    });
  });

  it('moves less with voice leading than in root position', () => {
    const total = (cs: number[][]) =>
      cs.slice(1).reduce((sum, c, i) => sum + c.reduce((a, n, k) => a + Math.abs(n - cs[i][k]), 0), 0);
    expect(total(buildPadChords(params))).toBeLessThan(total(buildPadChords({ ...params, voiceLead: false })));
  });

  it('respects the chord count and spread', () => {
    expect(buildPadChords({ ...params, count: 2 })).toHaveLength(2);
    const closed = buildPadChords({ ...params, voiceLead: false, count: 1 })[0];
    const open = buildPadChords({ ...params, voiceLead: false, count: 1, spread: true })[0];
    expect(open[open.length - 1] - open[0]).toBeGreaterThan(closed[closed.length - 1] - closed[0]);
  });

  it('keeps preset degrees valid', () => {
    PRESETS.slice(1).forEach((p) => {
      expect(p.degrees.length).toBeGreaterThan(0);
      expect(p.degrees.length).toBeLessThanOrEqual(4);
      p.degrees.forEach((d) => {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(7);
      });
    });
  });

  it('follows the drone root and sends chords to the engine', () => {
    const j = JSON.parse(toEngineJson(defaultState));
    expect(j.pad.chords).toHaveLength(4);
    expect(j.pad.barsPerChord).toBe(2);
    const moved = JSON.parse(toEngineJson({ ...defaultState, drone: { ...defaultState.drone, root: 40 } }));
    expect(pcs(moved.pad.chords[0])).toEqual([4, 7, 11]); // E minor over an E drone
  });

  it('adds the pad to old saved settings without losing them', () => {
    const s = migrateState({ bpm: 120 });
    expect(s.bpm).toBe(120);
    expect(s.pad.degrees).toEqual([1, 7, 4, 7]);
    expect(s.pad.mode).toBe(1);
  });
});
