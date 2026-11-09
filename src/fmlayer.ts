// The FM layer ("sizzle"): a little FM air laid on top of the chord pad's and the Keys' own sound. Global (not saved in
// a scene), one set of five settings per part. The native side (MidiBedTestSynth.swift, configureFM) takes the number
// list from `fmLayerValues`: for the pad then the keys: level (0-1, 0 = off), sizzle (0-1), shimmer (Hz), octave
// offset, bloom (seconds). KEEP THEM IN STEP (a jest test reads the Swift).
//
// How it sounds: a sine an octave or so above each note, shaken by modulators that beat against each other at the
// shimmer rate, with the modulation blooming in after the note starts. Designed and checked offline
// (scratchpad fm_layer.py): the pitch is right, sizzle moves the energy above 4 kHz from nothing to about a tenth, and the
// shimmer shows as a pulse at the chosen rate.

export type FMPartState = {
  /** 0 = a preset; 0 is Custom (your own settings), 1 and up are FM_PRESETS. Editing a setting makes it Custom. */
  preset: number;
  /** 0-100: how loud the layer is under the part's own sound (0 = off). */
  level: number;
  /** 0-100: how much sizzle (the amount of the high, slightly out-of-tune sparkle). */
  sizzle: number;
  /** Tenths of a hertz: how fast the sparkle pulses. */
  shimmer: number;
  /** Octaves above the note: -1, 0, 1 or 2. */
  octave: number;
  /** Tenths of a second the sizzle takes to bloom in after a note starts. */
  bloom: number;
};

export type FMLayerState = { pad: FMPartState; keys: FMPartState };

type Settings = Omit<FMPartState, 'preset'>;

export const FM_PRESETS: { name: string; v: Settings }[] = [
  { name: 'Custom', v: { level: 0, sizzle: 40, shimmer: 8, octave: 1, bloom: 15 } },
  { name: 'Off', v: { level: 0, sizzle: 40, shimmer: 8, octave: 1, bloom: 15 } },
  { name: 'Air', v: { level: 18, sizzle: 35, shimmer: 6, octave: 2, bloom: 25 } },
  { name: 'Glass', v: { level: 22, sizzle: 55, shimmer: 10, octave: 1, bloom: 15 } },
  { name: 'Bell halo', v: { level: 25, sizzle: 70, shimmer: 14, octave: 2, bloom: 8 } },
  { name: 'Thick shimmer', v: { level: 22, sizzle: 45, shimmer: 25, octave: 0, bloom: 20 } },
];

export const defaultFMPart: FMPartState = { preset: 1, ...FM_PRESETS[1].v };
export const defaultFMLayer: FMLayerState = { pad: { ...defaultFMPart }, keys: { ...defaultFMPart } };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export function applyFMPreset(s: FMPartState, preset: number): FMPartState {
  const p = clamp(Math.round(preset), 0, FM_PRESETS.length - 1);
  return p === 0 ? { ...s, preset: 0 } : { ...s, preset: p, ...FM_PRESETS[p].v };
}

/** Change one setting; the preset becomes Custom. */
export function setFMPart(s: FMPartState, change: Partial<Settings>): FMPartState {
  return { ...s, ...change, preset: 0 };
}

function partValues(s: FMPartState): number[] {
  return [
    clamp(s.level, 0, 100) / 100,
    clamp(s.sizzle, 0, 100) / 100,
    clamp(s.shimmer, 1, 80) / 10,
    clamp(Math.round(s.octave), -1, 2),
    clamp(s.bloom, 1, 80) / 10,
  ];
}

export function fmLayerValues(s: FMLayerState): number[] {
  return [...partValues(s.pad), ...partValues(s.keys)];
}

export function fmLayerJson(s: FMLayerState): string {
  return JSON.stringify({ values: fmLayerValues(s) });
}

/** A short spoken description, e.g. "Glass, level 22, sizzle 55". */
export function describeFM(s: FMPartState): string {
  return s.level <= 0 ? 'off' : `level ${s.level}, sizzle ${s.sizzle}`;
}
