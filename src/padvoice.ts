// The built-in chord pad's sound shape: a gentle way to give the pad some depth and slow movement. Global (not
// saved in a scene), like the keys' electric piano. The native side (MidiBedTestSynth.swift, configurePad) takes
// the number list from `padVoiceValues`, in this order: wave, detune (cents), drift, flange mix, flange rate (Hz),
// flange depth, flange feedback. KEEP THEM IN STEP (a jest test reads the Swift defaults).
//
//  wave     0 the original sawtooth pair, 50 a soft triangle, 100 a pure sine; levels are matched all the way
//  detune   how far apart the pad's two oscillators are tuned; more is wider and slower to beat
//  drift    how much that detune slowly breathes in and out (about every nine seconds)
//  flange   a short modulated delay with feedback on the pad: a slow whoosh of movement. Mix 0 is off.
//
// All of it is subtle by design: the strongest settings are still a soft sound, nothing brash.

export type PadVoiceState = {
  /** 0 is Custom; 1 and up are PAD_PRESETS. Editing a setting makes it Custom. */
  preset: number;
  wave: number;
  /** cents between the two oscillators, 0-40 */
  detune: number;
  /** percent 0-100 */
  drift: number;
  /** percent 0-100: how much flanging is mixed in (0 = off) */
  flange: number;
  /** tenths of a hertz, 1-60: how fast the flange sweeps */
  flangeRate: number;
  /** percent 0-100: how wide it sweeps */
  flangeDepth: number;
  /** percent 0-75: how much of the flange is fed back into itself (more is a stronger, more metallic whoosh) */
  flangeFeedback: number;
};

type Settings = Omit<PadVoiceState, 'preset'>;

export const PAD_PRESETS: { name: string; v: Settings }[] = [
  { name: 'Custom', v: { wave: 0, detune: 8.7, drift: 0, flange: 0, flangeRate: 15, flangeDepth: 40, flangeFeedback: 30 } },
  { name: 'Classic, as before', v: { wave: 0, detune: 8.7, drift: 0, flange: 0, flangeRate: 15, flangeDepth: 40, flangeFeedback: 30 } },
  { name: 'Soft', v: { wave: 40, detune: 10, drift: 15, flange: 0, flangeRate: 15, flangeDepth: 40, flangeFeedback: 30 } },
  { name: 'Warm drift', v: { wave: 25, detune: 14, drift: 45, flange: 0, flangeRate: 15, flangeDepth: 40, flangeFeedback: 30 } },
  { name: 'Gentle flange', v: { wave: 20, detune: 9, drift: 20, flange: 35, flangeRate: 15, flangeDepth: 40, flangeFeedback: 35 } },
  { name: 'Slow jet', v: { wave: 15, detune: 9, drift: 10, flange: 45, flangeRate: 7, flangeDepth: 70, flangeFeedback: 55 } },
  { name: 'Wide shimmer', v: { wave: 30, detune: 22, drift: 30, flange: 25, flangeRate: 30, flangeDepth: 25, flangeFeedback: 20 } },
  { name: 'Glass', v: { wave: 85, detune: 6, drift: 10, flange: 20, flangeRate: 12, flangeDepth: 30, flangeFeedback: 25 } },
];

export const defaultPadVoice: PadVoiceState = { preset: 1, ...PAD_PRESETS[1].v };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export function applyPadPreset(s: PadVoiceState, preset: number): PadVoiceState {
  const p = clamp(Math.round(preset), 0, PAD_PRESETS.length - 1);
  return p === 0 ? { ...s, preset: 0 } : { ...s, preset: p, ...PAD_PRESETS[p].v };
}

/** Change one setting; the preset becomes Custom. */
export function setPadVoice(s: PadVoiceState, change: Partial<Settings>): PadVoiceState {
  return { ...s, ...change, preset: 0 };
}

export function padVoiceValues(s: PadVoiceState): number[] {
  return [
    clamp(s.wave, 0, 100) / 100,
    clamp(s.detune, 0, 40),
    clamp(s.drift, 0, 100) / 100,
    clamp(s.flange, 0, 100) / 100,
    clamp(s.flangeRate, 1, 60) / 10,
    clamp(s.flangeDepth, 0, 100) / 100,
    clamp(s.flangeFeedback, 0, 75) / 100,
  ];
}

export function padVoiceJson(s: PadVoiceState): string {
  return JSON.stringify({ values: padVoiceValues(s) });
}
