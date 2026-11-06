import { measureOffsets, nudgeFromOnsets } from '../src/timing';
import { autoNudgeFor, defaultLane, lanesForEngine, setLoopDir, LibraryLoop } from '../src/looplib';

const fs = require('fs');
const path = require('path');

/** Hits on every beat of a 100 BPM loop (0.6 s), each `late` ms after the beat, with a little deterministic wobble. */
const hits = (bpm: number, count: number, late: number, wobble = 0) =>
  Array.from({ length: count }, (_, i) => (i * (60 / bpm) + (late + ((i * 7) % 5 - 2) * wobble) / 1000));

describe('measuring a loop\'s timing from its hit times', () => {
  it('finds the typical offset from a sixteenth grid', () => {
    const r = measureOffsets(hits(100, 8, 25), 100)!;
    expect(r.median).toBeCloseTo(25, 0);
    expect(r.spread).toBeLessThan(1);
    expect(r.hits).toBe(8);
  });

  it('corrects a steady offset by moving the loop the other way', () => {
    expect(nudgeFromOnsets(hits(100, 8, 25), 100)).toBe(-25);
    expect(nudgeFromOnsets(hits(100, 8, -50), 100)).toBe(50);
  });

  it('leaves a loop alone when it is already tight, wobbly, unmeasurable or too far off to tell', () => {
    expect(nudgeFromOnsets(hits(100, 8, 3), 100)).toBe(0); // under 8 ms
    expect(nudgeFromOnsets(hits(100, 8, 25, 40), 100)).toBe(0); // hits wander too much
    expect(nudgeFromOnsets([0.1, 0.2], 100)).toBe(0); // too few hits
    expect(nudgeFromOnsets(hits(100, 8, 25), null)).toBe(0); // no tempo to measure against
    expect(nudgeFromOnsets([], 100)).toBe(0); // a bed or a very long file
    expect(nudgeFromOnsets(undefined, 100)).toBeUndefined(); // an older build gave no hit times
  });

  it('agrees with the table made offline for the same kind of loop', () => {
    // 'TAMBOURINE STR 8THS NO ACCENT' loops sit about 50 ms early; the table says to move them about 50 ms later.
    const tableVal = (require('../src/looptiming').LOOP_TIMING as Record<string, number>)['tambourinestr8thsnoaccent90bpm'];
    expect(tableVal).toBeGreaterThan(35);
    expect(nudgeFromOnsets(hits(90, 12, -tableVal), 90)).toBeGreaterThan(35);
  });
});

describe('using the measured correction', () => {
  beforeAll(() => setLoopDir('file:///loops/'));
  const base: LibraryLoop = { id: 'a', name: 'No such loop 90bpm', folder: 'F', file: 'F__No such loop 90bpm.flac', seconds: 5.333, bpm: 90, bars: 2, repeats: 1, peak: 0.8, rms: 0.1 };
  const lanes = (extra = {}) => [{ ...defaultLane, loop: 'a', on: true, bars: 2, ...extra }, defaultLane, defaultLane, defaultLane, defaultLane];

  it('a measured value on the loop wins over the table, and zero means leave it', () => {
    expect(autoNudgeFor({ ...base, nudge: 17 })).toBe(17);
    expect(autoNudgeFor({ ...base, nudge: 0 })).toBe(0);
    expect(autoNudgeFor(base)).toBe(0); // not measured and not in the table
  });

  it('scales the correction by how fast the loop plays, so an offset keeps the same share of a beat', () => {
    // 2 bars at 90 BPM take 5.333 s: played at 90 the loop runs at its own speed.
    expect(lanesForEngine(lanes(), JSON.stringify([{ ...base, nudge: 20 }]), 100, 90)[0].nudge).toBe(20);
    // At 45 BPM the same bars last twice as long, the loop runs at half speed, and the offset doubles.
    expect(lanesForEngine(lanes(), JSON.stringify([{ ...base, nudge: 20 }]), 100, 45)[0].nudge).toBe(40);
    // The lane's own nudge is already in output time and is not scaled.
    expect(lanesForEngine(lanes({ nudge: 5 }), JSON.stringify([{ ...base, nudge: 20 }]), 100, 45)[0].nudge).toBe(45);
  });

  it('the native probe finds hit times and the app stores a correction', () => {
    const dir = path.join(process.cwd(), 'modules', 'midibed-engine', 'ios');
    expect(fs.readFileSync(path.join(dir, 'LoopPlayer.swift'), 'utf8')).toContain('onsets: [Double])?');
    expect(fs.readFileSync(path.join(dir, 'MidiBedEngine.swift'), 'utf8')).toContain('"onsets": p.onsets');
    const app = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
    expect(app).toContain('nudge: nudgeFromOnsets(info.onsets, bpm)');
    expect(app).toContain('timingTried');
  });
});
