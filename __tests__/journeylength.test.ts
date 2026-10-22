// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
import { advanceBars, describeAdvance, pickTarget } from '../src/advance';
import { barsToSeconds, durationText, journeyLength, lengthBreakdown, lengthSentence } from '../src/journeylength';

const H = { barsPerChord: 2, count: 4 }; // a chord loop is 8 bars
const sc = (mode: number, count = 1, unit = 0, target = 0) => ({ advance: { mode, count, unit, target }, harmony: H });
const label = (i: number) => `scene ${i + 1}`;

describe('the length of a journey', () => {
  it('adds up scenes that move on, up to one that ends the piece', () => {
    const len = journeyLength([sc(1, 16), sc(1, 2, 1), sc(1, 8), sc(4, 32)], 0);
    expect(len.kind).toBe('ends');
    expect(len.steps.map((s) => s.bars)).toEqual([16, 16, 8, 32]);
    expect(len.bars).toBe(72);
    // 72 bars at 90 beats per minute: 72 x 4 x 60 / 90 = 192 seconds
    expect(barsToSeconds(len.bars, 90)).toBe(192);
    expect(lengthSentence(len, 90, label)).toContain('ends by itself after 72 bars, 3 minutes 12 seconds');
  });

  it('counts chord loops as bars per chord times the number of chords', () => {
    expect(advanceBars({ mode: 1, count: 3, unit: 1, target: 0 }, H)).toBe(24);
  });

  it('stops at a scene that stays, and says how far it can tell', () => {
    const len = journeyLength([sc(1, 8), sc(1, 8), sc(0)], 0);
    expect(len.kind).toBe('stays');
    expect(len.bars).toBe(16);
    expect(lengthSentence(len, 120, label)).toContain('it takes 16 bars, 32 seconds to reach scene 3, which stays until you change it');
    expect(lengthSentence(journeyLength([sc(0), sc(0)], 1), 120, label)).toContain('stays until you change it, so there is no fixed length');
  });

  it('recognises scenes that go round for ever, and the lead-in before the circle', () => {
    const round = journeyLength([sc(1, 4), sc(1, 4), sc(1, 4), sc(1, 4)], 0);
    expect(round.kind).toBe('repeats');
    expect(round.cycleBars).toBe(16);
    const lead = journeyLength([sc(2, 4, 0, 1), sc(2, 4, 0, 2), sc(2, 4, 0, 1)], 0);
    expect(lead.kind).toBe('repeats');
    expect(lead.cycleStart).toBe(1);
    expect(lead.cycleBars).toBe(8);
    expect(lengthSentence(lead, 120, label)).toContain('4 bars lead in');
  });

  it('cannot give one figure when a scene picks the next one by chance', () => {
    const len = journeyLength([sc(1, 8), sc(3, 8), sc(0), sc(0)], 0);
    expect(len.kind).toBe('random');
    expect(len.bars).toBe(16);
    expect(lengthSentence(len, 120, label)).toContain('not fixed');
  });

  it('starts from the scene that is on, and lists each scene', () => {
    const len = journeyLength([sc(1, 4), sc(1, 4), sc(4, 4), sc(0)], 1);
    expect(len.steps.map((s) => s.scene)).toEqual([1, 2]);
    expect(lengthBreakdown(len, 120, label)).toBe('scene 2: 4 bars, 8 seconds. scene 3: 4 bars, 8 seconds');
  });

  it('writes durations in words', () => {
    expect(durationText(45)).toBe('45 seconds');
    expect(durationText(60)).toBe('1 minute');
    expect(durationText(203)).toBe('3 minutes 23 seconds');
    expect(durationText(1)).toBe('1 second');
  });
});

describe('End the piece', () => {
  it('has no scene to go to, and says so in words', () => {
    expect(pickTarget({ mode: 4, count: 8, unit: 0, target: 0 }, 0, 4, 0)).toBe(-1);
    expect(describeAdvance({ mode: 4, count: 8, unit: 0, target: 0 }, 8, 0, -1, false, false)).toBe('After 8 bars the piece ends');
    expect(describeAdvance({ mode: 4, count: 8, unit: 0, target: 0 }, 8, 3, -1, false, true)).toBe('The piece ends in 3 bars');
  });

  it('is wired through to the engine, which ends on the bar line where the scene would have moved on', () => {
    const e = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(e).toContain('var ending: MidiBedEndRequest?');
    expect(e).toContain('if cfg.advance.mode == 4, !ended, endTick < 0 || endFromAdvance');
    expect(e).toContain('endTick = tick + max(0, left) * barTicks');
    expect(e).toContain('guard cfg.advance.mode > 0, cfg.advance.mode != 4, n >= 2');
    // Freeze holds the ending back, and a new scene that does not end the piece cancels it
    expect(e).toContain('if endFromAdvance, endTick >= 0 { endTick += ticksPerBeat * beatsPerBar }');
    expect(e).toContain('if endFromAdvance, cfg.advance.mode != 4 {');
    const c = fs.readFileSync('src/config.ts', 'utf8');
    expect(c).toContain('...(s.advance.mode === 4 ? { ending: endingObject(s.ending) } : {})');
  });
});
