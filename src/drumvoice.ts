/**
 * The built-in drum sounds. Each drum slot picks a SOUND TYPE (any slot can be any type, whatever its note number)
 * and has five controls. The native synth (ios/MidiBedTestSynth.swift) plays them; the recipes were designed and
 * level-checked offline first (scratchpad drum_check.py). The numbers sent to the engine are in these units:
 * tune in semitones, decay as a multiplier (1 = normal), tone/snap/level 0-1.
 *
 * Only the built-in sound uses this. A drum sent to another app is just its note and channel, as before.
 */
// New types go at the END so a saved type number keeps its meaning (the native switch uses the same numbers).
export const DRUM_TYPES = ['Kick', 'Snare', 'Rim click', 'Clap', 'Closed hat', 'Open hat', 'Shaker', 'Tom', 'Wood block'];

export type DrumVoiceSettings = {
  voice: number; // index into DRUM_TYPES
  tune: number; // semitones, -12..12
  decay: number; // percent, 25..300
  tone: number; // percent, 0..100 (brighter)
  snap: number; // percent, 0..100 (noise / click / attack, depending on the type)
  level: number; // percent, 0..100
};

export const defaultDrumVoice: DrumVoiceSettings = { voice: 0, tune: 0, decay: 100, tone: 50, snap: 50, level: 100 };

/** Sound type for a drum by its role name, used to give the four starting drums sensible sounds. */
export function voiceForName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('kick')) return 0;
  if (n.includes('snare')) return 1;
  if (n.includes('hat')) return 4;
  if (n.includes('shaker')) return 6;
  return 8;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** The list the engine takes: one entry per drum (later drums win if two share a note). */
export function drumVoicesJson(
  drums: ({ note: number; channel: number } & Partial<DrumVoiceSettings>)[],
): string {
  return JSON.stringify(
    drums.map((d) => ({
      note: clamp(Math.round(d.note), 0, 127),
      channel: clamp(Math.round(d.channel), 0, 15),
      type: clamp(Math.round(d.voice ?? 0), 0, DRUM_TYPES.length - 1),
      tune: clamp(d.tune ?? 0, -12, 12),
      decay: clamp(d.decay ?? 100, 25, 300) / 100,
      tone: clamp(d.tone ?? 50, 0, 100) / 100,
      snap: clamp(d.snap ?? 50, 0, 100) / 100,
      level: clamp(d.level ?? 100, 0, 100) / 100,
    })),
  );
}

export function drumTuneText(v: number): string {
  return v === 0 ? 'as designed' : `${v > 0 ? 'up' : 'down'} ${Math.abs(v)} ${Math.abs(v) === 1 ? 'semitone' : 'semitones'}`;
}
