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
    expect(j.drone.chords).toEqual([[38, 50, 45]]);
    expect(j.wanderers[0].cc).toBe(74);
    expect(j.wanderers[0].smooth).toBeCloseTo(3);
  });
});

import { drumNoteLabel, migrateState } from '../src/config';

describe('saved-settings migration', () => {
  it('fills a brand new field into old saved data', () => {
    const old = { bpm: 100, drums: [{ name: 'Kick', note: 35 }] } as unknown;
    const s = migrateState(old);
    expect(s.bpm).toBe(100);
    expect(s.drums).toHaveLength(4);
    expect(s.drums[0].note).toBe(35);
    expect(s.drums[0].steps).toBe(16);
    expect(s.sounds).toHaveLength(3);
  });

  it('ignores garbage and wrong types', () => {
    expect(migrateState(null).bpm).toBe(88);
    expect(migrateState({ bpm: 'fast', swing: NaN }).bpm).toBe(88);
    expect(migrateState({ bpm: 'fast', swing: NaN }).swing).toBe(15);
  });

  it('labels GM drum notes and falls back to note names', () => {
    expect(drumNoteLabel(36)).toBe('36, Bass drum');
    expect(drumNoteLabel(82)).toBe('82, Shaker');
    expect(drumNoteLabel(62)).toBe('62, Mute hi conga');
    expect(drumNoteLabel(10)).toBe('10, A#-1');
  });
});
