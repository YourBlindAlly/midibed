/**
 * Drum fills: a short burst of snare and toms in the last beat or two of a bar, ending with a hit ON the downbeat
 * of the next bar, while the normal pattern drops out. The engine decides WHEN (every N bars, before a scene change
 * or auto-advance, as the drums come back from a breakdown, or on demand from a key or pedal) and plays the fill as
 * ordinary drum notes, so any drum app can play it. This file is the tested reference for how a fill is shaped; the
 * native `planFillHits` in MidiBedEngine.swift mirrors it.
 *
 * Which drums take part is decided by the built-in SOUND TYPE of each drum slot (see drumvoice.ts), whether or not
 * the slot is switched on in the normal pattern: a Snare, or a Tom (high, mid or low). So the tom slots can stay out
 * of the groove and still be used for fills.
 */
export type FillState = {
  enabled: boolean;
  /** Fill in the last beats of every Nth bar, counted from the scene start (0 = never on a count). */
  everyBars: number;
  /** A fill in the bar before a queued scene switch or an auto-advance. */
  beforeScene: boolean;
  /** A fill in the bar before the drums come back from a breakdown. */
  afterBreakdown: boolean;
  /** 0-100: how many of the available sixteenths are played. */
  density: number;
  /** 0-100: the chance a due fill actually plays (a fill asked for with a key or pedal always plays). */
  chance: number;
  /** The longest a fill may be, in beats: 1 or 2. It varies within this. */
  maxBeats: number;
};

export const defaultFill: FillState = {
  enabled: false,
  everyBars: 8,
  beforeScene: true,
  afterBreakdown: true,
  density: 50,
  chance: 70,
  maxBeats: 2,
};

/** role: 0 snare, 1 high tom, 2 mid tom, 3 low tom */
export type FillVoice = { note: number; channel: number; role: 0 | 1 | 2 | 3; velocity: number };
export type FillHit = { step: number; voice: number; velocity: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Sound types (drumvoice.ts numbers) that can take part, and their role. */
const ROLE_OF_VOICE: Record<number, 0 | 1 | 2 | 3> = { 1: 0, 12: 1, 7: 2, 11: 2, 10: 3 };

/** The drums a fill can use, from the drum slots (each: note, channel, velocity, voice type). */
export function fillPalette(drums: { note: number; channel: number; velocity: number; voice: number }[]): FillVoice[] {
  const out: FillVoice[] = [];
  for (const d of drums) {
    const role = ROLE_OF_VOICE[d.voice];
    if (role !== undefined) out.push({ note: d.note, channel: d.channel, role, velocity: d.velocity });
  }
  return out;
}

/**
 * The hits of one fill of `steps` sixteenth notes, plus the final hit on the downbeat. `rand` gives 0 up to 1.
 * The last sixteenth is always played (a pick-up into the downbeat). Early hits lean to snare, later ones fall
 * through the toms from high to low, and the volume rises through the fill.
 */
export function planFill(
  steps: number,
  density: number,
  palette: FillVoice[],
  rand: () => number,
): { hits: FillHit[]; final: FillHit } | null {
  if (palette.length === 0 || steps < 2) return null;
  const k = clamp(Math.round(1 + clamp(density, 0, 1) * (steps - 1)), 2, steps);
  const keep = [steps - 1];
  const pool: number[] = [];
  for (let s = 0; s < steps - 1; s++) pool.push(s);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  keep.push(...pool.slice(0, k - 1));
  keep.sort((a, b) => a - b);

  const snares: number[] = [];
  const toms: number[] = [];
  palette.forEach((v, i) => (v.role === 0 ? snares : toms).push(i));
  toms.sort((a, b) => palette[a].role - palette[b].role); // high to low

  let tomPos = 0;
  const hits: FillHit[] = keep.map((step, i) => {
    const p = keep.length > 1 ? i / (keep.length - 1) : 1;
    let voice: number;
    if (toms.length === 0) voice = snares[Math.floor(rand() * snares.length)];
    else if (snares.length === 0) voice = toms[tomPos];
    else voice = rand() < 0.35 + 0.2 * p ? snares[Math.floor(rand() * snares.length)] : toms[tomPos];
    if (toms.length > 0 && rand() < 0.6) tomPos = Math.min(toms.length - 1, tomPos + 1);
    const base = palette[voice].velocity;
    const velocity = clamp(Math.round(base * (0.7 + 0.4 * p) * (0.92 + 0.16 * rand())), 1, 127);
    return { step, voice, velocity };
  });

  const finalVoice = toms.length > 0 ? toms[toms.length - 1] : snares[0];
  return { hits, final: { step: steps, voice: finalVoice, velocity: clamp(Math.round(palette[finalVoice].velocity * 1.15), 1, 127) } };
}

/** The lengths (in sixteenths) a fill may have: 1, 1.5 or 2 beats, within the maximum. */
export function fillLengths(maxBeats: number): number[] {
  return maxBeats >= 2 ? [4, 6, 8] : [4];
}

/** One line for the screen: what is set. */
export function describeFill(f: FillState, paletteSize: number): string {
  if (!f.enabled) return 'Fills are off';
  if (paletteSize === 0) return 'No drum is set to a snare or tom sound, so there is nothing to fill with';
  const when: string[] = [];
  if (f.everyBars > 0) when.push(`every ${f.everyBars} bars`);
  if (f.beforeScene) when.push('before a scene change');
  if (f.afterBreakdown) when.push('as the drums come back');
  when.push('and when you ask');
  return `A fill ${when.join(', ')}, ${f.chance} percent of the time`;
}
