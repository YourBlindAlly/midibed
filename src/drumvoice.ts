/**
 * The built-in drum sounds. Each drum slot picks a SOUND TYPE (any slot can be any type, whatever its note number)
 * and has five controls. The native synth (ios/MidiBedTestSynth.swift) plays them; the recipes were designed and
 * level-checked offline first (scratchpad drum_check.py). The numbers sent to the engine are in these units:
 * tune in semitones, decay as a multiplier (1 = normal), tone/snap/level 0-1.
 *
 * Only the built-in sound uses this. A drum sent to another app is just its note and channel, as before.
 */
// New types go at the END so a saved type number keeps its meaning (the native switch uses the same numbers).
export const DRUM_TYPES = ['Kick', 'Snare', 'Rim click', 'Clap', 'Closed hat', 'Open hat', 'Sharp shaker (cabasa-like)', 'Tom', 'Wood block', 'Tambourine', 'Low tom', 'Mid tom', 'High tom', 'Jingle tambourine', 'Tube shaker', 'Seed shaker (maraca)', 'Egg shaker (small)', 'Sample pack'];

/** The sound type that plays recorded sounds from an imported pack (src/packs.ts). */
export const SAMPLE_PACK_TYPE = 17;

export type DrumVoiceSettings = {
  voice: number; // index into DRUM_TYPES
  tune: number; // semitones, -12..12
  decay: number; // percent, 25..300
  tone: number; // percent, 0..100 (brighter)
  snap: number; // percent, 0..100 (noise / click / attack, depending on the type)
  level: number; // percent, 0..100
  /** percent, 0..100: how much each hit differs from the last. 0 = every hit is exactly the same sound (tight and even); 100 = every hit a little different, as a real shaker is. */
  variation: number;
  /** For the sample pack sound: which pack and which group of it (src/packs.ts). */
  packId?: string;
  packGroup?: string;
};

export const defaultDrumVoice: DrumVoiceSettings = { voice: 0, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 100 };

/** Sound type for a drum by its role name, used to give the four starting drums sensible sounds. */
export function voiceForName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('kick')) return 0;
  if (n.includes('snare')) return 1;
  if (n.includes('hat')) return 4;
  if (n.includes('shaker')) return 14; // the egg shaker; the sharp one (6) is still there as a choice
  if (n.includes('tamb')) return 9;
  if (n.includes('low') && n.includes('tom')) return 10;
  if (n.includes('mid') && n.includes('tom')) return 11;
  if (n.includes('high') && n.includes('tom')) return 12;
  if (n.includes('tom')) return 7;
  return 8;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** The list the engine takes: one entry per drum (later drums win if two share a note). */
export function drumVoicesJson(
  drums: ({ note: number; channel: number } & Partial<DrumVoiceSettings>)[],
  /** For each drum, the number of its sample-pack group in the list sent to the engine (-1 none). */
  groupOf: number[] = [],
): string {
  return JSON.stringify(
    drums.map((d, i) => ({
      ...((groupOf[i] ?? -1) >= 0 ? { group: groupOf[i] } : {}),
      note: clamp(Math.round(d.note), 0, 127),
      channel: clamp(Math.round(d.channel), 0, 15),
      type: clamp(Math.round(d.voice ?? 0), 0, DRUM_TYPES.length - 1),
      tune: clamp(d.tune ?? 0, -12, 12),
      decay: clamp(d.decay ?? 100, 25, 300) / 100,
      tone: clamp(d.tone ?? 50, 0, 100) / 100,
      snap: clamp(d.snap ?? 50, 0, 100) / 100,
      level: clamp(d.level ?? 100, 0, 100) / 100,
      variation: clamp(d.variation ?? 100, 0, 100) / 100,
    })),
  );
}

export function drumTuneText(v: number): string {
  return v === 0 ? 'as designed' : `${v > 0 ? 'up' : 'down'} ${Math.abs(v)} ${Math.abs(v) === 1 ? 'semitone' : 'semitones'}`;
}
