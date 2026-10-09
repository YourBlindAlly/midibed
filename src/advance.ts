/**
 * Auto-advance: a scene can move on to another scene by itself after a number of bars or
 * chord loops. The reference for the native engine (stepAdvance / pickTarget in
 * MidiBedEngine.swift), which must behave identically.
 *
 * The count starts at the scene's first bar line (Play or a scene switch). The scene plays
 * exactly `bars` bars, then the next scene begins on that bar line. FREEZE pauses the
 * countdown (and the other things that change the bed by itself) until it is released.
 */
export type AdvanceRule = {
  mode: number; // 0 stay, 1 next scene, 2 a chosen scene, 3 a random other scene
  count: number; // how many bars or chord loops
  unit: number; // 0 bars, 1 chord loops
  target: number; // 0-based scene number, used when mode is 2
};

export const ADVANCE_MODE_NAMES = [
  'Stay here until I change it',
  'Go to the next scene',
  'Go to a chosen scene',
  'Go to a random other scene',
];
export const ADVANCE_UNIT_NAMES = ['bars', 'chord loops'];

export const defaultAdvance: AdvanceRule = { mode: 0, count: 2, unit: 1, target: 0 };

/** Total bars the scene plays before advancing; 0 means it never does. */
export function advanceBars(rule: AdvanceRule, harmony: { barsPerChord: number; count: number }): number {
  if (rule.mode === 0) return 0;
  const loopBars = Math.max(1, harmony.barsPerChord) * Math.max(1, harmony.count);
  return Math.max(1, rule.count) * (rule.unit === 1 ? loopBars : 1);
}

/**
 * Which scene comes next, or -1 if none. `roll` (0 to 1) picks among the others when random.
 * "A chosen scene" that is the scene itself falls back to the next one.
 */
export function pickTarget(rule: AdvanceRule, current: number, sceneCount: number, roll: number): number {
  if (sceneCount < 2 || rule.mode === 0) return -1;
  if (rule.mode === 1) return (current + 1) % sceneCount;
  if (rule.mode === 2) return rule.target === current || rule.target < 0 || rule.target >= sceneCount ? (current + 1) % sceneCount : rule.target;
  const others: number[] = [];
  for (let i = 0; i < sceneCount; i++) if (i !== current) others.push(i);
  return others[Math.min(others.length - 1, Math.floor(roll * others.length))];
}

/**
 * Advance the countdown at one bar line (called for every bar line after the scene's first).
 * `barsLeft` is what remains, `bars` the rule's total. Returns the new count and whether to
 * move to the next scene NOW (on this bar line). Frozen: nothing counts down.
 */
export function stepAdvance(barsLeft: number, bars: number, frozen: boolean): { barsLeft: number; fire: boolean } {
  if (bars <= 0) return { barsLeft: 0, fire: false };
  // Switched on mid-scene, or the total was shortened: start from the right count.
  let left = barsLeft <= 0 ? bars : Math.min(barsLeft, bars);
  if (frozen) return { barsLeft: left, fire: false };
  left -= 1;
  return left <= 0 ? { barsLeft: 0, fire: true } : { barsLeft: left, fire: false };
}

/** A sentence for the screen: what happens next in this scene. */
export function describeAdvance(rule: AdvanceRule, bars: number, barsLeft: number, target: number, frozen: boolean, playing: boolean): string {
  if (rule.mode === 0 || bars <= 0) return 'This scene stays until you change it';
  const to = target >= 0 ? `scene ${target + 1}` : 'the next scene';
  if (frozen) return 'Frozen: the scene is not changing by itself';
  const n = playing && barsLeft > 0 ? barsLeft : bars;
  const when = `${n} ${n === 1 ? 'bar' : 'bars'}`;
  return playing ? `Changes to ${to} in ${when}` : `After ${when} it changes to ${to}`;
}
