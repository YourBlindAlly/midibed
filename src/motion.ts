/**
 * "Breathing": per-layer rules that flip a layer between its normal state and an
 * alternate every so many bars. This is the reference for the rule logic; the
 * native engine (MidiBedEngine.swift, `stepRule`) must behave identically.
 *
 * A rule is counted in bars from the start of the scene (a scene switch, or
 * Play). It stays in its normal state for `baseBars`, then, with probability
 * `chance`, flips to the alternate for `altBars`, then flips back, and so on.
 * If the roll fails it simply stays where it is for another interval.
 * `baseBars` of 0 switches the rule off.
 */
export type MotionRule = {
  baseBars: number; // 0 = off
  altBars: number;
  chance: number; // percent 1-100
};

export type DrumBreakdown = {
  baseBars: number; // bars of normal drums; 0 = off
  breakBars: number; // bars of breakdown
  chance: number; // percent 1-100
  style: number; // index into BREAKDOWN_NAMES
};

export type MotionState = {
  bass: MotionRule;
  pad: MotionRule;
  drums: DrumBreakdown;
};

export const BREAKDOWN_NAMES = ['Full: all drums out', 'Light: kick and snare out', 'Kick only: everything else out'];

export const defaultMotion: MotionState = {
  bass: { baseBars: 0, altBars: 4, chance: 100 },
  pad: { baseBars: 0, altBars: 4, chance: 100 },
  drums: { baseBars: 0, breakBars: 2, chance: 100, style: 0 },
};

export type RuleRuntime = { alt: boolean; barsLeft: number };

export function startRule(baseBars: number): RuleRuntime {
  return { alt: false, barsLeft: Math.max(0, baseBars) };
}

/**
 * Advance one rule at a bar line. Call once per bar line AFTER the first bar of
 * the scene. `roll` is a random number in [0, 1); `chance` is a percentage.
 */
export function stepRule(
  rt: RuleRuntime,
  rule: { baseBars: number; altBars: number; chance: number },
  roll: number,
): { rt: RuleRuntime; changed: boolean } {
  if (rule.baseBars <= 0) return { rt: { alt: false, barsLeft: 0 }, changed: rt.alt };
  let { alt, barsLeft } = rt;
  // A rule switched on mid-scene starts its first interval now.
  if (barsLeft <= 0) barsLeft = alt ? Math.max(1, rule.altBars) : rule.baseBars;
  barsLeft -= 1;
  if (barsLeft > 0) return { rt: { alt, barsLeft }, changed: false };
  let changed = false;
  if (roll * 100 < rule.chance) {
    alt = !alt;
    changed = true;
  }
  barsLeft = alt ? Math.max(1, rule.altBars) : rule.baseBars;
  return { rt: { alt, barsLeft }, changed };
}

/** Which drums a breakdown silences. Roles come from the drum's name. */
export function breakdownMutes(role: string, style: number): boolean {
  if (style === 1) return role === 'kick' || role === 'snare';
  if (style === 2) return role !== 'kick';
  return true;
}

export function drumRole(name: string): 'kick' | 'snare' | 'other' {
  const n = name.toLowerCase();
  if (n.includes('kick')) return 'kick';
  if (n.includes('snare')) return 'snare';
  return 'other';
}

export type MotionNow = { bass: boolean; pad: boolean; drums: boolean };

/** A short sentence for the screen and for announcements. */
export function describeMotion(
  now: MotionNow,
  base: { bassFollows: boolean; padSteadyFifths: boolean },
  style: number,
): { bass: string; pad: string; drums: string } {
  const bassFollowing = base.bassFollows !== now.bass;
  const padShowsFifths = base.padSteadyFifths !== now.pad;
  return {
    bass: bassFollowing ? 'Bass following the chords' : 'Bass steady on the key',
    pad: padShowsFifths ? 'Pad on steady fifths' : 'Pad on chords',
    drums: now.drums ? `Drums ${['breakdown', 'light breakdown', 'kick only'][style] ?? 'breakdown'}` : 'Drums playing',
  };
}
