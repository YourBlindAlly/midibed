/**
 * The built-in bass voice (native: ios/BassVoice.swift): a Taurus / Lowdown style mono bass with two
 * oscillators, a sub, a 24 dB ladder filter, envelopes, glide and an LFO. This file holds the settings
 * table (what the screen shows) and the presets; `bassVoiceValues` turns them into the plain number list
 * the engine takes, in the order of `BassParam` in BassVoice.swift (KEEP THEM IN STEP).
 *
 * The values here are in screen units (percent, milliseconds, cents); the table converts them.
 */
export type BassParamDef = {
  key: string;
  label: string;
  group: 'oscillators' | 'filter' | 'envelopes' | 'movement';
  min: number;
  max: number;
  step: number;
  bigStep?: number;
  unit: 'pct' | 'ms' | 'cents' | 'int' | 'hz10' | 'hz' | 'toggle';
  def: number;
  hint?: string;
  /** Screen value to the number the DSP uses. */
  toDsp: (v: number) => number;
};

const pct = (v: number) => v / 100;
const ms = (v: number) => v / 1000;
const same = (v: number) => v;

// ORDER = BassParam in BassVoice.swift.
export const BASS_PARAMS: BassParamDef[] = [
  { key: 'waveA', label: 'Oscillator 1 wave', group: 'oscillators', min: 0, max: 2, step: 1, unit: 'int', def: 0, toDsp: same, hint: 'Saw, pulse or triangle' },
  { key: 'waveB', label: 'Oscillator 2 wave', group: 'oscillators', min: 0, max: 2, step: 1, unit: 'int', def: 1, toDsp: same },
  { key: 'octaveB', label: 'Oscillator 2 octave', group: 'oscillators', min: -2, max: 1, step: 1, unit: 'int', def: 0, toDsp: same },
  { key: 'detuneB', label: 'Oscillator 2 detune', group: 'oscillators', min: 0, max: 50, step: 1, bigStep: 5, unit: 'cents', def: 7, toDsp: same, hint: 'A little detune thickens the sound' },
  { key: 'mixB', label: 'Oscillator balance', group: 'oscillators', min: 0, max: 100, step: 5, unit: 'pct', def: 50, toDsp: pct, hint: 'Zero is oscillator 1 alone, 100 is oscillator 2 alone' },
  { key: 'sub', label: 'Sub oscillator', group: 'oscillators', min: 0, max: 100, step: 5, unit: 'pct', def: 50, toDsp: pct, hint: 'A sine one octave below oscillator 1' },
  { key: 'pulseWidth', label: 'Pulse width', group: 'oscillators', min: 5, max: 95, step: 5, unit: 'pct', def: 50, toDsp: pct },
  { key: 'cutoff', label: 'Filter cutoff', group: 'filter', min: 0, max: 100, step: 5, unit: 'pct', def: 35, toDsp: pct, hint: 'The filter movement on the Parts tab moves around this setting' },
  { key: 'resonance', label: 'Filter resonance', group: 'filter', min: 0, max: 100, step: 5, unit: 'pct', def: 25, toDsp: pct },
  { key: 'drive', label: 'Drive', group: 'filter', min: 0, max: 100, step: 5, unit: 'pct', def: 30, toDsp: pct, hint: 'Saturation into the filter, for growl' },
  { key: 'keyTrack', label: 'Key tracking', group: 'filter', min: 0, max: 100, step: 10, unit: 'pct', def: 30, toDsp: pct, hint: 'Higher notes open the filter more' },
  { key: 'filterEnv', label: 'Filter envelope amount', group: 'filter', min: 0, max: 100, step: 5, unit: 'pct', def: 35, toDsp: pct, hint: 'How far each note opens the filter' },
  { key: 'fAttack', label: 'Filter attack', group: 'envelopes', min: 0, max: 2000, step: 5, bigStep: 100, unit: 'ms', def: 5, toDsp: ms },
  { key: 'fDecay', label: 'Filter decay', group: 'envelopes', min: 5, max: 4000, step: 10, bigStep: 200, unit: 'ms', def: 350, toDsp: ms },
  { key: 'fSustain', label: 'Filter sustain', group: 'envelopes', min: 0, max: 100, step: 5, unit: 'pct', def: 20, toDsp: pct },
  { key: 'fRelease', label: 'Filter release', group: 'envelopes', min: 5, max: 4000, step: 10, bigStep: 200, unit: 'ms', def: 400, toDsp: ms },
  { key: 'aAttack', label: 'Volume attack', group: 'envelopes', min: 0, max: 2000, step: 5, bigStep: 100, unit: 'ms', def: 10, toDsp: ms },
  { key: 'aDecay', label: 'Volume decay', group: 'envelopes', min: 5, max: 4000, step: 10, bigStep: 200, unit: 'ms', def: 200, toDsp: ms },
  { key: 'aSustain', label: 'Volume sustain', group: 'envelopes', min: 0, max: 100, step: 5, unit: 'pct', def: 90, toDsp: pct, hint: 'For a held drone keep this high' },
  { key: 'aRelease', label: 'Volume release', group: 'envelopes', min: 5, max: 6000, step: 10, bigStep: 200, unit: 'ms', def: 500, toDsp: ms },
  { key: 'glide', label: 'Glide', group: 'movement', min: 0, max: 1000, step: 10, bigStep: 100, unit: 'ms', def: 0, toDsp: ms, hint: 'How long it takes to slide from one note to the next' },
  { key: 'legato', label: 'Legato', group: 'movement', min: 0, max: 1, step: 1, unit: 'toggle', def: 1, toDsp: same, hint: 'On: overlapping notes slide instead of restarting the envelopes' },
  { key: 'lfoRate', label: 'LFO rate', group: 'movement', min: 1, max: 200, step: 1, bigStep: 10, unit: 'hz10', def: 20, toDsp: (v) => v / 10 },
  { key: 'lfoFilter', label: 'LFO to filter', group: 'movement', min: 0, max: 100, step: 5, unit: 'pct', def: 0, toDsp: pct },
  { key: 'lfoPitch', label: 'LFO to pitch', group: 'movement', min: 0, max: 100, step: 5, unit: 'cents', def: 0, toDsp: same, hint: 'A gentle wobble in the pitch' },
  { key: 'velocity', label: 'Velocity response', group: 'movement', min: 0, max: 100, step: 10, unit: 'pct', def: 50, toDsp: pct },
  { key: 'weight', label: 'Low end weight', group: 'movement', min: 0, max: 100, step: 5, unit: 'pct', def: 30, toDsp: pct, hint: 'Adds body below about 120 Hz' },
  { key: 'level', label: 'Bass voice level', group: 'movement', min: 0, max: 100, step: 5, unit: 'pct', def: 70, toDsp: pct },
  { key: 'moveDepth', label: 'Filter movement depth', group: 'filter', min: 0, max: 100, step: 5, unit: 'pct', def: 40, toDsp: pct, hint: 'How far the filter movement on the Parts tab swings this voice. Lower keeps the bass from disappearing when the filter dips' },
  { key: 'floorHz', label: 'Filter floor', group: 'filter', min: 20, max: 500, step: 10, bigStep: 50, unit: 'hz', def: 120, toDsp: same, hint: 'The cutoff never closes below this, so the bass stays audible' },
  { key: 'subBypass', label: 'Sub bypasses the filter', group: 'oscillators', min: 0, max: 100, step: 10, unit: 'pct', def: 70, toDsp: pct, hint: 'How much of the sub oscillator skips the filter, so the low note stays when the filter closes' },
];

export const BASS_PARAM_COUNT = BASS_PARAMS.length;
export const WAVE_NAMES = ['Saw', 'Pulse', 'Triangle'];

export type BassVoiceState = {
  /** Use the built-in bass voice for the bass drone's channel instead of the pad-type sound. */
  enabled: boolean;
  /** The built-in sound plays ONLY the bass voice (no built-in pad, drums or noise-free extras). */
  exclusive: boolean;
  preset: number; // 0 = custom
  v: Record<string, number>;
};

type Preset = { name: string; values: Partial<Record<string, number>> };

// Index 0 is Custom: choosing it changes nothing. New presets go at the END.
export const BASS_PRESETS: Preset[] = [
  { name: 'Custom', values: {} },
  {
    name: 'Taurus pedal',
    values: { waveA: 0, waveB: 0, octaveB: 0, detuneB: 9, mixB: 50, sub: 70, pulseWidth: 50, cutoff: 28, resonance: 15, drive: 35, keyTrack: 20, filterEnv: 25, fAttack: 5, fDecay: 600, fSustain: 30, fRelease: 600, aAttack: 8, aDecay: 300, aSustain: 95, aRelease: 700, glide: 0, legato: 1, lfoRate: 20, lfoFilter: 0, lfoPitch: 0, velocity: 40, weight: 55, level: 70, moveDepth: 40, floorHz: 120, subBypass: 70 },
  },
  {
    name: 'Lowdown growl',
    values: { waveA: 0, waveB: 1, octaveB: -1, detuneB: 5, mixB: 55, sub: 40, pulseWidth: 35, cutoff: 30, resonance: 40, drive: 60, keyTrack: 40, filterEnv: 55, fAttack: 3, fDecay: 250, fSustain: 15, fRelease: 250, aAttack: 5, aDecay: 180, aSustain: 80, aRelease: 300, glide: 40, legato: 1, lfoRate: 20, lfoFilter: 0, lfoPitch: 0, velocity: 70, weight: 40, level: 70, moveDepth: 40, floorHz: 120, subBypass: 70 },
  },
  {
    name: 'Deep sub',
    values: { waveA: 2, waveB: 2, octaveB: 0, detuneB: 0, mixB: 0, sub: 90, pulseWidth: 50, cutoff: 20, resonance: 0, drive: 10, keyTrack: 0, filterEnv: 10, fAttack: 5, fDecay: 300, fSustain: 50, fRelease: 300, aAttack: 15, aDecay: 200, aSustain: 100, aRelease: 400, glide: 0, legato: 1, lfoRate: 20, lfoFilter: 0, lfoPitch: 0, velocity: 30, weight: 60, level: 75, moveDepth: 25, floorHz: 80, subBypass: 90 },
  },
  {
    name: 'Pluck',
    values: { waveA: 0, waveB: 1, octaveB: 0, detuneB: 6, mixB: 40, sub: 50, pulseWidth: 40, cutoff: 20, resonance: 30, drive: 30, keyTrack: 30, filterEnv: 70, fAttack: 2, fDecay: 180, fSustain: 0, fRelease: 200, aAttack: 2, aDecay: 260, aSustain: 0, aRelease: 200, glide: 0, legato: 0, lfoRate: 20, lfoFilter: 0, lfoPitch: 0, velocity: 70, weight: 40, level: 75, moveDepth: 40, floorHz: 120, subBypass: 70 },
  },
  {
    name: 'Warm drone',
    values: { waveA: 0, waveB: 2, octaveB: 0, detuneB: 6, mixB: 45, sub: 60, pulseWidth: 50, cutoff: 30, resonance: 20, drive: 20, keyTrack: 20, filterEnv: 20, fAttack: 800, fDecay: 1500, fSustain: 60, fRelease: 1500, aAttack: 600, aDecay: 800, aSustain: 100, aRelease: 1500, glide: 150, legato: 1, lfoRate: 8, lfoFilter: 25, lfoPitch: 0, velocity: 20, weight: 45, level: 70, moveDepth: 40, floorHz: 120, subBypass: 70 },
  },
  {
    name: 'Acid squelch',
    values: { waveA: 0, waveB: 0, octaveB: 0, detuneB: 0, mixB: 0, sub: 0, pulseWidth: 50, cutoff: 15, resonance: 75, drive: 40, keyTrack: 30, filterEnv: 80, fAttack: 2, fDecay: 200, fSustain: 0, fRelease: 150, aAttack: 2, aDecay: 200, aSustain: 80, aRelease: 120, glide: 60, legato: 1, lfoRate: 20, lfoFilter: 0, lfoPitch: 0, velocity: 60, weight: 20, level: 65, moveDepth: 60, floorHz: 60, subBypass: 0 },
  },
];

export const defaultBassVoice: BassVoiceState = {
  enabled: false,
  exclusive: false,
  preset: 0,
  v: Object.fromEntries(BASS_PARAMS.map((p) => [p.key, p.def])),
};

const clampTo = (def: BassParamDef, v: number) => Math.max(def.min, Math.min(def.max, Math.round(Number.isFinite(v) ? v : def.def)));

/** The settings after choosing a preset (Custom changes nothing). */
export function applyBassPreset(s: BassVoiceState, index: number): BassVoiceState {
  const i = Math.max(0, Math.min(BASS_PRESETS.length - 1, Math.round(index)));
  if (i === 0) return { ...s, preset: 0 };
  const v = { ...s.v };
  for (const p of BASS_PARAMS) {
    const x = BASS_PRESETS[i].values[p.key];
    if (x !== undefined) v[p.key] = clampTo(p, x);
  }
  return { ...s, preset: i, v };
}

/** Change one setting; the preset becomes Custom. */
export function setBassParam(s: BassVoiceState, key: string, value: number): BassVoiceState {
  const def = BASS_PARAMS.find((p) => p.key === key);
  if (!def) return s;
  return { ...s, preset: 0, v: { ...s.v, [key]: clampTo(def, value) } };
}

/** The list of numbers the engine takes, in BassParam order. */
export function bassVoiceValues(s: BassVoiceState): number[] {
  return BASS_PARAMS.map((p) => p.toDsp(clampTo(p, s.v[p.key] ?? p.def)));
}

/** What the engine receives: JSON for the native `setBassVoice`. */
export function bassVoiceJson(s: BassVoiceState): string {
  return JSON.stringify({ enabled: s.enabled, exclusive: s.enabled && s.exclusive, values: bassVoiceValues(s) });
}

export function paramText(def: BassParamDef, value: number): string {
  switch (def.unit) {
    case 'pct':
      return `${value} percent`;
    case 'ms':
      return value === 0 ? 'none' : value >= 1000 ? `${(value / 1000).toFixed(2)} seconds` : `${value} milliseconds`;
    case 'cents':
      return `${value} cents`;
    case 'hz10':
      return `${(value / 10).toFixed(1)} hertz`;
    case 'hz':
      return `${value} hertz`;
    case 'toggle':
      return value ? 'on' : 'off';
    default:
      return def.key.startsWith('wave') ? WAVE_NAMES[Math.max(0, Math.min(2, value))] : value > 0 && def.key === 'octaveB' ? `up ${value}` : String(value);
  }
}
