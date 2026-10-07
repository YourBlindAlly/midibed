import { describePattern, euclidPattern, patternText } from '../src/euclid';
import { droneNotes, defaultState, noteName, toEngineJson } from '../src/config';

describe('euclid', () => {
  it('spreads 4 hits evenly over 16 steps', () => {
    expect(patternText(4, 16, 0)).toBe('x...x...x...x...');
  });

  it('rotates the pattern', () => {
    expect(patternText(2, 16, 4)).toBe('....x.......x...');
  });

  it('handles zero hits and full hits', () => {
    expect(patternText(0, 8, 0)).toBe('........');
    expect(patternText(8, 8, 0)).toBe('xxxxxxxx');
  });

  it('handles negative rotation', () => {
    expect(euclidPattern(4, 16, -4)).toEqual(euclidPattern(4, 16, 12));
  });

  it('describes hits for speech', () => {
    expect(describePattern(4, 16, 0)).toBe('hits on steps 1, 5, 9, 13 of 16');
    expect(describePattern(0, 8, 0)).toBe('silent, 8 steps');
  });
});

describe('config', () => {
  it('names notes with C4 = 60', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(38)).toBe('D2');
  });

  it('builds drone chord from root, octave and fifth', () => {
    expect(droneNotes(defaultState.drone)).toEqual([38, 50, 45]);
  });

  it('serializes to the shape the engine decodes', () => {
    const j = JSON.parse(toEngineJson(defaultState));
    expect(j.bpm).toBe(88);
    expect(j.swing).toBeCloseTo(0.15);
    expect(j.drums).toHaveLength(4);
    expect(j.drone.notes).toEqual([38, 50, 45]);
    expect(j.wanderers[0].cc).toBe(74);
    expect(j.wanderers[0].smooth).toBeCloseTo(3);
  });
});
