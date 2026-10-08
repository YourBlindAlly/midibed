import { MOTION_PRESET_NAMES, breakdownMutes, defaultMotion, describeMotion, drumRole, motionPreset, startRule, stepRule } from '../src/motion';

// Run a rule for `bars` bars (bar 0 is the scene's first bar, no step) and record alt per bar.
function run(rule: { baseBars: number; altBars: number; chance: number }, bars: number, rolls: number[] = []) {
  let rt = startRule(rule.baseBars);
  const out: boolean[] = [rt.alt];
  const changes: number[] = [];
  for (let bar = 1; bar < bars; bar++) {
    const r = stepRule(rt, rule, rolls[bar] ?? 0);
    rt = r.rt;
    if (r.changed) changes.push(bar);
    out.push(rt.alt);
  }
  return { out, changes };
}

describe('breathing rules', () => {
  it('stays normal for baseBars, flips for altBars, flips back, and repeats', () => {
    const { out, changes } = run({ baseBars: 4, altBars: 2, chance: 100 }, 14);
    expect(out.map((a) => (a ? 'A' : 'b')).join('')).toBe('bbbbAAbbbbAAbb');
    expect(changes).toEqual([4, 6, 10, 12]);
  });

  it('is symmetric when both lengths are the same', () => {
    const { out } = run({ baseBars: 2, altBars: 2, chance: 100 }, 8);
    expect(out.map((a) => (a ? 'A' : 'b')).join('')).toBe('bbAAbbAA');
  });

  it('does nothing when switched off', () => {
    const { out, changes } = run({ baseBars: 0, altBars: 4, chance: 100 }, 20);
    expect(out.every((a) => !a)).toBe(true);
    expect(changes).toEqual([]);
  });

  it('with a low chance, a failed roll just stays put for another interval', () => {
    // Rolls: bar 4 fails (0.9 >= 0.5), bar 8 succeeds (0.1 < 0.5).
    const rolls = [0, 0, 0, 0, 0.9, 0, 0, 0, 0.1, 0, 0, 0, 0];
    const { out, changes } = run({ baseBars: 4, altBars: 2, chance: 50 }, 13, rolls);
    expect(changes).toEqual([8, 10]);
    expect(out.map((a) => (a ? 'A' : 'b')).join('')).toBe('bbbbbbbbAAbbb');
  });

  it('never flips at 0 percent in practice (chance is at least 1 in the UI), and always flips at 100', () => {
    const { changes } = run({ baseBars: 1, altBars: 1, chance: 100 }, 6, [0, 0.999, 0.999, 0.999, 0.999, 0.999]);
    expect(changes).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns to normal at once if the rule is switched off while flipped', () => {
    const r = stepRule({ alt: true, barsLeft: 3 }, { baseBars: 0, altBars: 4, chance: 100 }, 0);
    expect(r.rt.alt).toBe(false);
    expect(r.changed).toBe(true);
  });

  it('starts counting when switched on in the middle of a scene', () => {
    let rt = { alt: false, barsLeft: 0 };
    const rule = { baseBars: 3, altBars: 1, chance: 100 };
    const seen: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const r = stepRule(rt, rule, 0);
      rt = r.rt;
      seen.push(rt.alt);
    }
    expect(seen).toEqual([false, false, true, false, false, false]);
  });
});

describe('drum breakdown', () => {
  it('full silences every drum', () => {
    ['kick', 'snare', 'other'].forEach((r) => expect(breakdownMutes(r, 0)).toBe(true));
  });
  it('light silences only kick and snare', () => {
    expect(breakdownMutes('kick', 1)).toBe(true);
    expect(breakdownMutes('snare', 1)).toBe(true);
    expect(breakdownMutes('other', 1)).toBe(false);
  });
  it('kick only leaves just the kick playing', () => {
    expect(breakdownMutes('kick', 2)).toBe(false);
    expect(breakdownMutes('snare', 2)).toBe(true);
    expect(breakdownMutes('other', 2)).toBe(true);
  });
  it('finds roles from the drum names', () => {
    expect(drumRole('Kick')).toBe('kick');
    expect(drumRole('Snare')).toBe('snare');
    expect(drumRole('Hat')).toBe('other');
    expect(drumRole('Shaker')).toBe('other');
  });
});

describe('describing what is happening', () => {
  it('reads the bass relative to its normal setting', () => {
    const base = { bassFollows: false, padSteadyFifths: false };
    expect(describeMotion({ bass: false, pad: false, drums: false }, base, 0).bass).toBe('Bass steady on the key');
    expect(describeMotion({ bass: true, pad: false, drums: false }, base, 0).bass).toBe('Bass following the chords');
    expect(describeMotion({ bass: true, pad: false, drums: false }, { ...base, bassFollows: true }, 0).bass).toBe('Bass steady on the key');
  });
  it('reads the pad and drums', () => {
    const base = { bassFollows: false, padSteadyFifths: false };
    expect(describeMotion({ bass: false, pad: true, drums: true }, base, 1)).toEqual({
      bass: 'Bass steady on the key',
      pad: 'Pad on steady fifths',
      drums: 'Drums light breakdown',
    });
    expect(describeMotion({ bass: false, pad: true, drums: false }, { ...base, padSteadyFifths: true }, 0).pad).toBe('Pad on chords');
  });
  it('has everything off by default', () => {
    expect(defaultMotion.bass.baseBars).toBe(0);
    expect(defaultMotion.pad.baseBars).toBe(0);
    expect(defaultMotion.drums.baseBars).toBe(0);
  });
});

describe('drop-outs and presets', () => {
  it('describes a bass or pad that drops out, instead of following or fifths', () => {
    const base = { bassFollows: false, padSteadyFifths: false };
    const kinds = { bass: 1, pad: 1 };
    expect(describeMotion({ bass: true, pad: true, drums: false }, base, 0, kinds)).toMatchObject({ bass: 'Bass dropped out', pad: 'Pad dropped out' });
    expect(describeMotion({ bass: false, pad: false, drums: false }, base, 0, kinds)).toMatchObject({ bass: 'Bass playing', pad: 'Pad playing' });
  });

  it('has Custom as the first preset, which changes nothing, and four ready-made ones', () => {
    expect(MOTION_PRESET_NAMES).toEqual(['Custom', 'Off', 'Gentle', 'Wide', 'Sparse']);
    expect(motionPreset(0)).toBeNull();
    for (let i = 1; i < MOTION_PRESET_NAMES.length; i++) expect(motionPreset(i)?.preset).toBe(i);
  });

  it('Off switches everything off and Sparse is the one that drops layers out', () => {
    const off = motionPreset(1)!;
    expect([off.bass.baseBars, off.pad.baseBars, off.drums.baseBars]).toEqual([0, 0, 0]);
    const sparse = motionPreset(4)!;
    expect(sparse.bass.kind).toBe(1);
    expect(sparse.pad.kind).toBe(1);
    expect(motionPreset(2)!.bass.kind).toBe(0);
    expect(motionPreset(3)!.pad.kind).toBe(0);
  });

  it('keeps every preset value in the ranges the screen allows', () => {
    for (let i = 1; i < MOTION_PRESET_NAMES.length; i++) {
      const m = motionPreset(i)!;
      for (const r of [m.bass, m.pad]) {
        expect(r.baseBars).toBeGreaterThanOrEqual(0);
        expect(r.baseBars).toBeLessThanOrEqual(64);
        expect(r.altBars).toBeGreaterThanOrEqual(1);
        expect(r.chance).toBeGreaterThanOrEqual(10);
        expect(r.chance).toBeLessThanOrEqual(100);
        expect([0, 1]).toContain(r.kind);
      }
      expect([0, 1, 2]).toContain(m.drums.style);
    }
  });
});
