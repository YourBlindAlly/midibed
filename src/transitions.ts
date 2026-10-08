/**
 * Transition sounds made by MidiBed's own noise generator (white, pink or brown noise
 * shaped by a filter and a volume curve). Names are Rusty's.
 *
 * Shapes (indexes are saved in settings; add new ones at the END):
 *   0 Wave    swells up into the bar line, then falls away after it       (lead-in)
 *   1 Wind    filtered noise rises into the bar line, then a short cut     (lead-in)
 *   2 Thunder a low rumble that rolls in on the bar and slowly fades
 *   3 Boom    a low thump on the bar
 *   4 Crash   a bright burst on the bar that closes and fades
 * Lead-ins start BEFORE the bar line (they rise over `beats`); the others play ON it.
 */
export const NOISE_SHAPE_NAMES = ['Wave', 'Wind', 'Thunder', 'Boom', 'Crash'];
export const NOISE_COLOR_NAMES = ['White', 'Pink', 'Brown'];

export const NOISE_SHAPE_HINTS = [
  'Swells up into the change and falls away just after it',
  'Rises into the change, then stops',
  'A low rumble that rolls in on the change and slowly fades',
  'A low thump on the change',
  'A bright burst on the change that fades',
];

export type TransitionSlot = {
  on: boolean;
  shape: number; // index into NOISE_SHAPE_NAMES
  color: number; // index into NOISE_COLOR_NAMES
  beats: number; // lead-in rise time, or how long the sound lasts
  level: number; // percent
};

/**
 * The sounds themselves are GLOBAL (set once, on the Sound tab): how a scene starts, how
 * the drums break down, and how they come back. Each scene then only says whether it uses
 * each one (see TransitionUse).
 */
export type TransitionsState = {
  entrance: TransitionSlot;
  drumBreak: TransitionSlot;
  drumReturn: TransitionSlot;
};

/** Per scene: does this scene play each transition sound? (A sound also needs to be on globally.) */
export type TransitionUse = {
  entrance: boolean;
  drumBreak: boolean;
  drumReturn: boolean;
};

export const defaultTransitionUse: TransitionUse = { entrance: true, drumBreak: true, drumReturn: true };

/**
 * Version of the level scale. Version 2 made every noise shape about five times quieter
 * than the Boom at the same level (the Boom is mostly deep bass a phone barely reproduces,
 * so it needs a higher setting). Levels saved before version 2 are multiplied by 5, except
 * the Boom, so nothing sounds different after the upgrade.
 */
export const NOISE_VERSION = 2;

export const defaultTransitions: TransitionsState = {
  entrance: { on: false, shape: 1, color: 1, beats: 8, level: 25 },
  drumBreak: { on: true, shape: 3, color: 0, beats: 4, level: 50 },
  drumReturn: { on: false, shape: 1, color: 0, beats: 8, level: 25 },
};

export function isLeadIn(shape: number): boolean {
  return shape === 0 || shape === 1;
}

export type TransitionPlan = {
  shape: number;
  /** How far into the lead-up to begin, in beats (0 = from its very start). */
  offsetBeats: number;
  mode: 'full' | 'partial' | 'downer' | 'onbar';
};

/**
 * What to play when a transition is triggered with `remainingBeats` left before the bar
 * line. The reference for the native engine (`scheduleTransition` in MidiBedEngine.swift),
 * which must behave identically.
 *  - Not a lead-in: it just plays on the bar.
 *  - Enough room (at least `minLeadBeats`): the lead-in plays; if less than its full rise
 *    remains it joins its sweep part-way ("partial"), so it still ends on the bar.
 *  - Too close: only the "downer" plays, on the bar: Wave its falling half, Wind a Crash.
 */
export function planTransition(shape: number, preBeats: number, remainingBeats: number, minLeadBeats: number): TransitionPlan {
  if (!isLeadIn(shape)) return { shape, offsetBeats: 0, mode: 'onbar' };
  if (remainingBeats >= minLeadBeats) {
    const offset = Math.max(0, preBeats - remainingBeats);
    return { shape, offsetBeats: offset, mode: offset > 0 ? 'partial' : 'full' };
  }
  if (shape === 0) return { shape: 0, offsetBeats: preBeats, mode: 'downer' };
  return { shape: 4, offsetBeats: 0, mode: 'downer' };
}

/** "an eighth note", "a beat (two eighth notes)", "3 eighth notes" ... for the shortest-lead-in setting. */
export function eighthsText(n: number): string {
  if (n <= 0) return 'no minimum';
  if (n === 1) return 'an eighth note';
  if (n === 2) return 'a beat (two eighth notes)';
  return `${n} eighth notes`;
}
