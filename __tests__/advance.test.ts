import { ADVANCE_MODE_NAMES, advanceBars, defaultAdvance, describeAdvance, pickTarget, stepAdvance } from '../src/advance';

describe('how long a scene plays', () => {
  const harmony = { barsPerChord: 2, count: 4 }; // a chord loop is 8 bars

  it('never advances when it stays', () => {
    expect(advanceBars({ ...defaultAdvance, mode: 0, count: 5 }, harmony)).toBe(0);
  });
  it('counts bars directly', () => {
    expect(advanceBars({ mode: 1, count: 16, unit: 0, target: 0 }, harmony)).toBe(16);
  });
  it('counts chord loops as bars-per-chord times chords', () => {
    expect(advanceBars({ mode: 1, count: 2, unit: 1, target: 0 }, harmony)).toBe(16);
    expect(advanceBars({ mode: 1, count: 3, unit: 1, target: 0 }, { barsPerChord: 4, count: 2 })).toBe(24);
  });
  it('plays at least one bar', () => {
    expect(advanceBars({ mode: 1, count: 0, unit: 0, target: 0 }, harmony)).toBe(1);
  });
  it('names the four modes', () => {
    expect(ADVANCE_MODE_NAMES).toHaveLength(4);
  });
});

describe('which scene comes next', () => {
  const rule = (mode: number, target = 0) => ({ mode, count: 4, unit: 0, target });

  it('the next scene wraps round to the first', () => {
    expect(pickTarget(rule(1), 0, 4, 0)).toBe(1);
    expect(pickTarget(rule(1), 3, 4, 0)).toBe(0);
  });
  it('a chosen scene goes there, and falls back to the next if it is the scene itself', () => {
    expect(pickTarget(rule(2, 2), 0, 4, 0)).toBe(2);
    expect(pickTarget(rule(2, 1), 1, 4, 0)).toBe(2);
    expect(pickTarget(rule(2, 9), 0, 4, 0)).toBe(1);
  });
  it('random never picks the scene it is in, and can pick every other one', () => {
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.05) {
      const t = pickTarget(rule(3), 1, 4, r);
      expect(t).not.toBe(1);
      seen.add(t);
    }
    expect([...seen].sort()).toEqual([0, 2, 3]);
    expect(pickTarget(rule(3), 2, 4, 0.9999)).toBe(3);
  });
  it('does nothing with one scene, or when staying', () => {
    expect(pickTarget(rule(1), 0, 1, 0)).toBe(-1);
    expect(pickTarget(rule(0), 0, 4, 0)).toBe(-1);
  });
});

describe('the countdown', () => {
  // Run bar lines 1, 2, 3... after the scene's first bar; report the bar line it fires on.
  function runUntilFire(bars: number, frozenAt: number[] = [], maxBars = 100) {
    let left = bars;
    for (let bar = 1; bar <= maxBars; bar++) {
      const r = stepAdvance(left, bars, frozenAt.includes(bar));
      left = r.barsLeft;
      if (r.fire) return bar;
    }
    return -1;
  }

  it('a scene set to N bars plays exactly N bars, then the next begins on that bar line', () => {
    expect(runUntilFire(2)).toBe(2);
    expect(runUntilFire(8)).toBe(8);
    expect(runUntilFire(1)).toBe(1);
  });

  it('never fires when off', () => {
    expect(runUntilFire(0)).toBe(-1);
  });

  it('freezing holds the countdown, and it carries on where it left off', () => {
    // 4 bars, frozen on bar lines 2 and 3: two bar lines do not count, so it fires 2 bar lines later.
    expect(runUntilFire(4, [2, 3])).toBe(6);
    expect(runUntilFire(4, [1, 2, 3, 4, 5, 6, 7, 8], 8)).toBe(-1); // frozen throughout
  });

  it('starts counting if switched on in the middle of a scene', () => {
    const r = stepAdvance(0, 4, false);
    expect(r).toEqual({ barsLeft: 3, fire: false });
  });

  it('a shortened total takes effect at once', () => {
    expect(stepAdvance(10, 3, false)).toEqual({ barsLeft: 2, fire: false });
  });
});

describe('the sentence on the screen', () => {
  const rule = { mode: 1, count: 2, unit: 0, target: 0 };
  it('says the scene stays when it does', () => {
    expect(describeAdvance({ ...rule, mode: 0 }, 0, 0, -1, false, true)).toBe('This scene stays until you change it');
  });
  it('counts down while playing', () => {
    expect(describeAdvance(rule, 8, 5, 2, false, true)).toBe('Changes to scene 3 in 5 bars');
    expect(describeAdvance(rule, 8, 1, 2, false, true)).toBe('Changes to scene 3 in 1 bar');
  });
  it('describes the rule when stopped', () => {
    expect(describeAdvance(rule, 8, 0, 1, false, false)).toBe('After 8 bars it changes to scene 2');
  });
  it('says so when frozen', () => {
    expect(describeAdvance(rule, 8, 5, 2, true, true)).toBe('Frozen: the scene is not changing by itself');
  });
  it('names a random target as the next scene while it is not yet chosen', () => {
    expect(describeAdvance(rule, 8, 5, -1, false, true)).toBe('Changes to the next scene in 5 bars');
  });
});
