// The standalone FM voice: a plucked or bell-like sound of its own, built from the same FM engine as the FM layer. It
// listens on its own MIDI channel, so a MidiWeave line (or anything else) can play on it instead of the Keys. Global
// (not saved in a scene). The native side (MidiBedTestSynth.swift, configureFMVoice) takes the number list from
// `fmVoiceValues`, in this order: level (0-1), brightness (0-1), decay (seconds), pluck (seconds), shimmer (Hz),
// character (0 harmonic pluck, 1 inharmonic bell), octave, MIDI channel. KEEP THEM IN STEP (a jest test reads the Swift).
//
// Designed and checked offline (scratchpad fm_voice.py): the pitch is right, the level is close to a pad note's (peak
// about 0.14), brightness 0 is a clean sine and brightness 100 puts a sixth of the attack's energy above 3 kHz, and the
// decay time is as set.

export const FM_CHARACTER_NAMES = ['Pluck (whole-number ratios)', 'Bell (inharmonic ratios)'];

export type FMVoiceState = {
  /** 0 is Custom; 1 and up are FM_VOICE_PRESETS. Editing a setting makes it Custom. */
  preset: number;
  /** 0-100: how loud the voice is. */
  level: number;
  /** 0-100: how bright the attack is. */
  bright: number;
  /** Hundredths of a second: how long a note rings (5-400). */
  decay: number;
  /** Hundredths of a second: how quickly the brightness fades after the attack (2-300). */
  pluck: number;
  /** Tenths of a hertz: how fast the sparkle pulses (1-80). */
  shimmer: number;
  character: number;
  /** -1, 0, 1 or 2 octaves from the note played. */
  octave: number;
  /** MIDI channel (0-based). */
  channel: number;
};

type Settings = Omit<FMVoiceState, 'preset' | 'channel'>;

export const FM_VOICE_PRESETS: { name: string; v: Settings }[] = [
  { name: 'Custom', v: { level: 70, bright: 35, decay: 50, pluck: 15, shimmer: 8, character: 0, octave: 0 } },
  { name: 'Soft pluck', v: { level: 70, bright: 35, decay: 50, pluck: 15, shimmer: 8, character: 0, octave: 0 } },
  { name: 'Bright pluck', v: { level: 70, bright: 70, decay: 45, pluck: 12, shimmer: 8, character: 0, octave: 0 } },
  { name: 'Short pluck', v: { level: 70, bright: 55, decay: 22, pluck: 8, shimmer: 8, character: 0, octave: 0 } },
  { name: 'Glass bell', v: { level: 65, bright: 55, decay: 150, pluck: 80, shimmer: 12, character: 1, octave: 0 } },
  { name: 'Long bell', v: { level: 60, bright: 40, decay: 250, pluck: 150, shimmer: 10, character: 1, octave: 0 } },
  { name: 'High bell', v: { level: 55, bright: 45, decay: 120, pluck: 60, shimmer: 14, character: 1, octave: 1 } },
];

export const defaultFMVoice: FMVoiceState = { preset: 1, ...FM_VOICE_PRESETS[1].v, channel: 6 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export function applyFMVoicePreset(s: FMVoiceState, preset: number): FMVoiceState {
  const p = clamp(Math.round(preset), 0, FM_VOICE_PRESETS.length - 1);
  return p === 0 ? { ...s, preset: 0 } : { ...s, preset: p, ...FM_VOICE_PRESETS[p].v };
}

/** Change one setting; the preset becomes Custom. */
export function setFMVoice(s: FMVoiceState, change: Partial<Settings>): FMVoiceState {
  return { ...s, ...change, preset: 0 };
}

export function fmVoiceValues(s: FMVoiceState): number[] {
  return [
    clamp(s.level, 0, 100) / 100,
    clamp(s.bright, 0, 100) / 100,
    clamp(s.decay, 5, 400) / 100,
    clamp(s.pluck, 2, 300) / 100,
    clamp(s.shimmer, 1, 80) / 10,
    clamp(Math.round(s.character), 0, 1),
    clamp(Math.round(s.octave), -1, 2),
    clamp(Math.round(s.channel), 0, 15),
  ];
}

export function fmVoiceJson(s: FMVoiceState): string {
  return JSON.stringify({ values: fmVoiceValues(s) });
}
