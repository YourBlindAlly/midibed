/**
 * Filter movement ("wanderers"), in musical time. This is the reference for the native engine
 * (updateWanderers in MidiBedEngine.swift), which must behave identically.
 *
 * Each filter has two kinds of motion that are blended:
 *  - a clean CYCLE: 0 at its start, up to 1 half way through, back to 0, repeating every
 *    `cycleBars` bars, counted from the start of the scene;
 *  - free WANDERING: a random walk that can cross its whole range in `cycleBars` bars.
 * `looseness` (0 to 1) says how much of each: 0 is the pure cycle, 1 is pure wandering.
 * The result is eased (smoothed) over `smoothBeats`. A filter can also OPPOSE another: it moves
 * the other way, by `opposeAmount`, so two filters do not brighten and darken together.
 */
export const PHASE_NAMES = ['Starts at the bottom', 'A quarter of a cycle later', 'Half a cycle later', 'Three quarters later'];

/** Where in its cycle a filter starts, from the 0-3 setting (0, 25, 50, 75 percent). */
export function phaseOffset(setting: number): number {
  return Math.max(0, Math.min(3, Math.round(setting))) / 4;
}

/** The clean cycle at a moment: 0 at the start, 1 half way through the cycle. */
export function lfoAt(elapsedBars: number, cycleBars: number, phase: number): number {
  const p = (((elapsedBars / Math.max(0.25, cycleBars) + phase) % 1) + 1) % 1;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
}

/** Mix the clean cycle and the free wandering. looseness: 0 = all cycle, 1 = all wandering. */
export function blend(lfo: number, walk: number, looseness: number): number {
  const l = Math.max(0, Math.min(1, looseness));
  return (1 - l) * lfo + l * walk;
}

/**
 * Apply opposition. `norms` are each filter's own position (0 to 1), `opposes[i]` is the index
 * of the filter i moves against (or -1), `amounts[i]` how much (0 to 1). Everyone is mixed from
 * the ORIGINAL positions, so two filters opposing each other swap smoothly instead of chasing.
 */
export function applyOppose(norms: number[], opposes: number[], amounts: number[]): number[] {
  return norms.map((v, i) => {
    const j = opposes[i];
    if (j === undefined || j < 0 || j >= norms.length || j === i) return v;
    const a = Math.max(0, Math.min(1, amounts[i] ?? 0));
    return (1 - a) * v + a * (1 - norms[j]);
  });
}

/** A position (0 to 1) as a MIDI value between min and max. */
export function toRange(norm: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.round(lo + (hi - lo) * Math.max(0, Math.min(1, norm)));
}

/**
 * Old settings were in seconds. Convert them at a fixed 88 BPM so a saved sweep keeps its pace:
 * speed was "percent of the range per second", smoothing was tenths of a second.
 */
export function cycleBarsFromOldSpeed(percentPerSecond: number, bpm = 88): number {
  const secondsForFullRange = 100 / Math.max(0.5, percentPerSecond);
  const barSeconds = (60 / bpm) * 4;
  return Math.max(1, Math.min(64, Math.round(secondsForFullRange / barSeconds)));
}

export function smoothBeatsFromOldSmooth(tenthsOfSeconds: number, bpm = 88): number {
  return Math.max(1, Math.min(16, Math.round((tenthsOfSeconds / 10) * (bpm / 60))));
}
