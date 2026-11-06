/**
 * Working out how far a loop's hits sit from the beat, from the hit times the native probe finds when a loop is
 * added (see LoopPlayer.probe). Reference for the table in looptiming.ts, which was made the same way offline.
 *
 * The hits are measured against a sixteenth-note grid at the loop's own tempo (from its name). The correction is
 * the opposite of the typical (median) offset, and only trusted when the hits are consistent: if they wander more
 * than 30 ms, or the typical offset is under 8 ms or more than the grid can tell apart, no correction is made
 * (a swung or free loop is left as it is). Positive = move the loop later, negative = earlier.
 */
export const TIMING_MAX_SPREAD_MS = 30;
export const TIMING_MIN_FIX_MS = 8;
export const TIMING_MAX_FIX_MS = 80;

export type TimingResult = { median: number; spread: number; hits: number };

export function measureOffsets(onsets: number[] | undefined, bpm: number | null): TimingResult | null {
  if (!onsets || onsets.length < 4 || !bpm || !(bpm > 0)) return null;
  const step = 60 / bpm / 4;
  const dev = onsets.map((t) => (t - Math.round(t / step) * step) * 1000);
  const sorted = [...dev].sort((a, b) => a - b);
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const median = med(sorted);
  const spread = med(dev.map((d) => Math.abs(d - median))) * 1.4826;
  return { median, spread, hits: onsets.length };
}

/**
 * The correction to store for a loop: a whole number of milliseconds, 0 when it should be left alone, or undefined
 * when nothing could be measured (no hit times from the phone, such as an older build).
 */
export function nudgeFromOnsets(onsets: number[] | undefined, bpm: number | null): number | undefined {
  if (!onsets) return undefined;
  const r = measureOffsets(onsets, bpm);
  if (!r || !bpm) return 0;
  const half = ((60 / bpm / 4) * 1000) / 2;
  const off = Math.abs(r.median);
  if (r.spread > TIMING_MAX_SPREAD_MS || off < TIMING_MIN_FIX_MS || off > Math.min(TIMING_MAX_FIX_MS, half * 0.9)) return 0;
  return Math.round(-r.median);
}
