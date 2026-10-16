import { bassNoteSeconds, bassRhythmSteps } from '../src/bassrhythm';
import { applyScene, copyScenePart, defaultState, migrateState, toEngineJson } from '../src/config';
import { RHYTHMS } from '../src/rhythms';

describe('bass rhythm (notes locked to the kick)', () => {
  it('plays on each kick hit, lasting until the next one', () => {
    const syncopated = [0, 5, 8];
    expect(bassRhythmSteps(syncopated, 16, 1, 0)).toEqual([
      { step: 0, gap: 5 },
      { step: 5, gap: 3 },
      { step: 8, gap: 8 },
    ]);
  });

  it('can use every other kick', () => {
    expect(bassRhythmSteps([0, 4, 8, 12], 16, 1, 1)).toEqual([
      { step: 0, gap: 4 },
      { step: 8, gap: 4 },
    ]);
  });

  it('puts a note halfway between kick hits for the offbeat bass', () => {
    // four on the floor: the gaps are 4 steps, so the notes sit on the 'and' of each beat
    expect(bassRhythmSteps([0, 4, 8, 12], 16, 2, 0)).toEqual([
      { step: 2, gap: 2 },
      { step: 6, gap: 2 },
      { step: 10, gap: 2 },
      { step: 14, gap: 2 },
    ]);
    // an odd gap: 5 steps, the note goes after 3, leaving 2 to the next kick
    expect(bassRhythmSteps([0, 5, 8], 16, 2, 0)).toEqual([
      { step: 3, gap: 2 },
      { step: 7, gap: 1 },
      { step: 12, gap: 4 },
    ]);
  });

  it('a single kick: the note is half a bar after it; a gap of one step has no room for a note', () => {
    expect(bassRhythmSteps([0], 16, 2, 0)).toEqual([{ step: 8, gap: 8 }]);
    expect(bassRhythmSteps([0, 1], 4, 2, 0)).toEqual([{ step: 3, gap: 1 }]);
    expect(bassRhythmSteps([], 16, 1, 0)).toEqual([]);
  });

  it('works from the real rhythm library (kick on 1 and 3)', () => {
    const r = RHYTHMS.find((x) => x.name === 'Kick on 1 and 3')!;
    expect(bassRhythmSteps(r.hits, r.steps, 1, 0).map((s) => s.step)).toEqual([0, 8]);
    expect(bassRhythmSteps(r.hits, r.steps, 2, 0).map((s) => s.step)).toEqual([4, 12]);
  });

  it('a note lasts a share of the gap, never shorter than 30 ms', () => {
    expect(bassNoteSeconds(4, 0.15, 50)).toBeCloseTo(0.297, 3);
    expect(bassNoteSeconds(1, 0.01, 10)).toBe(0.03);
  });
});

describe('bass rhythm in the settings', () => {
  it('starts as a held drone, is sent to the engine, and is saved with the scene', () => {
    expect(defaultState.drone.rhythm).toBe(0);
    const s = { ...defaultState, drone: { ...defaultState.drone, rhythm: 2, rhythmLength: 50, rhythmNotes: 2, rhythmSkip: 1 } };
    expect(JSON.parse(toEngineJson(s)).drone.rhythm).toMatchObject({ mode: 2, lengthPct: 50, notes: 2, skip: 1 });
    const copied = copyScenePart(s, 1, 2);
    expect(applyScene(copied, copied.scenes[1]).drone.rhythm).toBe(2);
  });

  it('older saved settings gain the defaults', () => {
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.drone.rhythm;
    delete old.drone.rhythmLength;
    for (const sc of old.scenes) delete sc.drone.rhythm;
    const m = migrateState(old);
    expect(m.drone.rhythm).toBe(0);
    expect(m.drone.rhythmLength).toBe(70);
    expect(m.scenes[2].drone.rhythm).toBe(0);
  });

  it('the Swift engine has the matching pieces', () => {
    const fs = require('fs');
    const swift = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(swift).toContain('private func stepBassRhythm(');
    expect(swift).toContain('struct MidiBedBassRhythm');
    expect(swift).toContain('var rhythm: MidiBedBassRhythm?');
  });
});

describe('bass colour notes', () => {
  const { buildBassColorNotes } = require('../src/bassrhythm');
  const { bassColorNotes } = require('../src/config');
  const aMinor = {
    root: 33, // A1
    mode: 5, // Aeolian
    degrees: [1, 6, 7, 4],
    count: 4,
    follow: true,
    octave: false,
    fifth: false,
    below: true,
    stepKind: 0,
    relRoot: true,
    relThird: true,
  };

  it('over A minor: G below, C (root of the related major) and E (its third)', () => {
    const am = buildBassColorNotes(aMinor)[0];
    expect(am).toEqual([31, 36, 40]); // G1, C2, E2
  });

  it('over a major chord (F in A minor): the step below, the related minor root D, and its own third A', () => {
    const f = buildBassColorNotes(aMinor)[1];
    // F1 is 29; whole step below 27, related minor root 26 (D), the chord's third 33 (A)
    expect(f).toEqual([27, 26, 33]);
  });

  it('the next note down the scale: a half step where the scale has one', () => {
    const scale = buildBassColorNotes({ ...aMinor, stepKind: 1, relRoot: false, relThird: false });
    expect(scale[0]).toEqual([31]); // A minor: G is a whole step below A
    expect(scale[1]).toEqual([28]); // F in A minor: E is a half step below F
    const cMajor = buildBassColorNotes({ ...aMinor, root: 36, mode: 0, degrees: [1], count: 1, stepKind: 1, relRoot: false, relThird: false });
    expect(cMajor[0]).toEqual([35]); // B under C
    const whole = buildBassColorNotes({ ...aMinor, root: 36, mode: 0, degrees: [1], count: 1, stepKind: 0, relRoot: false, relThird: false });
    expect(whole[0]).toEqual([34]); // B-flat under C
  });

  it('only the ticked kinds are made', () => {
    expect(buildBassColorNotes({ ...aMinor, relRoot: false, relThird: false })[0]).toEqual([31]);
    expect(buildBassColorNotes({ ...aMinor, below: false, relThird: false })[0]).toEqual([36]);
    expect(buildBassColorNotes({ ...aMinor, below: false, relRoot: false, relThird: false })[0]).toEqual([]);
  });

  it('a steady drone has one list, on the key root', () => {
    const steady = buildBassColorNotes({ ...aMinor, follow: false });
    expect(steady).toHaveLength(1);
    expect(steady[0]).toEqual([31, 36, 40]);
  });

  it('is sent to the engine only when the rhythm is on and the chance is above zero', () => {
    const base = { ...defaultState, drone: { ...defaultState.drone, rhythm: 1, colorChance: 30, colorBelow: true, colorRelRoot: true, colorRelThird: false, follow: true } };
    const j = JSON.parse(toEngineJson(base)).drone.rhythm;
    expect(j.colorChance).toBeCloseTo(0.3);
    expect(j.colorNotes).toHaveLength(base.harmony.count);
    expect(j.altColorNotes).toHaveLength(1); // the other version of a following bass is one steady note
    expect(bassColorNotes({ ...base, drone: { ...base.drone, colorChance: 0 } })).toEqual([]);
    expect(bassColorNotes({ ...base, drone: { ...base.drone, rhythm: 0 } })).toEqual([]);
  });

  it('is saved per scene, off by default, and the Swift engine reads it', () => {
    expect(defaultState.drone.colorChance).toBe(0);
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.drone.colorChance;
    for (const sc of old.scenes) delete sc.drone.colorChance;
    expect(migrateState(old).scenes[1].drone.colorChance).toBe(0);
    const swift = require('fs').readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(swift).toContain('var colorNotes: [[Int]]?');
    expect(swift).toContain('step % 16 != 0');
  });
});
