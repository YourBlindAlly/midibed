/**
 * "Ugly FX": the built-in sound's effects (native: ios/UglyFX.swift). Plain on purpose. Per part (bass drone,
 * chord pad, MidiDancer, drums): pan, reverb send, delay send, chorus. Shared: reverb size and darkness,
 * delay time (a note length at the current tempo) and repeats. Only the built-in sound is affected; apps
 * that get MIDI from MidiBed have their own effects.
 *
 * `uglyFxJson` makes the number list the engine takes, in the order of `UglyFXParam` in UglyFX.swift
 * (KEEP THEM IN STEP; a jest test compares the names).
 */
export const FX_PARTS = ['bass', 'pad', 'dancer', 'drums'] as const;
/** The parts with effects. The four in FX_PARTS come first in the engine's list; the keys' four come after the loops'. */
export type FxPart = (typeof FX_PARTS)[number] | 'keys';

export type FxPartState = {
  /** -100 (left) ... 100 (right) */
  pan: number;
  /** 0-100 percent */
  reverb: number;
  delay: number;
  chorus: number;
};

export type FxState = {
  bass: FxPartState;
  pad: FxPartState;
  dancer: FxPartState;
  drums: FxPartState;
  /** The keys (a fifth part; its four values come after the loops' in the engine's list). */
  keys: FxPartState;
  /** The loop player (stereo): balance and the two sends; chorus is reserved. */
  loops: FxPartState;
  /** 0-100 */
  size: number;
  /** 0-100, more = darker tail */
  damp: number;
  /** 0 eighth note, 1 dotted eighth, 2 quarter note */
  delayNote: number;
  /** repeats, 0-70 percent */
  repeats: number;
};

export const defaultFx: FxState = {
  bass: { pan: 0, reverb: 0, delay: 0, chorus: 0 },
  pad: { pan: 0, reverb: 30, delay: 0, chorus: 35 },
  dancer: { pan: 0, reverb: 0, delay: 0, chorus: 0 },
  drums: { pan: 0, reverb: 15, delay: 0, chorus: 0 },
  keys: { pan: 0, reverb: 25, delay: 0, chorus: 20 },
  loops: { pan: 0, reverb: 10, delay: 0, chorus: 0 },
  size: 55,
  damp: 50,
  delayNote: 1,
  repeats: 30,
};

export const DELAY_NOTES = ['Eighth note', 'Dotted eighth note', 'Quarter note'];
const DELAY_BEATS = [0.5, 0.75, 1];

/** Order = UglyFXParam in UglyFX.swift. */
export const UGLY_FX_PARAMS = [
  'bassPan', 'bassReverb', 'bassDelay', 'bassChorus',
  'padPan', 'padReverb', 'padDelay', 'padChorus',
  'dancerPan', 'dancerReverb', 'dancerDelay', 'dancerChorus',
  'drumsPan', 'drumsReverb', 'drumsDelay', 'drumsChorus',
  'reverbSize', 'reverbDamp', 'delayMs', 'delayFeedback',
  'loopsPan', 'loopsReverb', 'loopsDelay', 'loopsChorus',
  'keysPan', 'keysReverb', 'keysDelay', 'keysChorus',
];

export function delayMs(fx: FxState, bpm: number): number {
  const beat = 60000 / Math.max(30, bpm);
  return Math.round(Math.max(60, Math.min(1500, beat * DELAY_BEATS[Math.max(0, Math.min(2, fx.delayNote))])));
}

export function uglyFxValues(fx: FxState, bpm: number): number[] {
  const out: number[] = [];
  for (const p of FX_PARTS) {
    const s = fx[p];
    out.push(s.pan / 100, s.reverb / 100, s.delay / 100, s.chorus / 100);
  }
  out.push(fx.size / 100, fx.damp / 100, delayMs(fx, bpm), Math.min(70, fx.repeats) / 100);
  out.push(fx.loops.pan / 100, fx.loops.reverb / 100, fx.loops.delay / 100, fx.loops.chorus / 100);
  out.push(fx.keys.pan / 100, fx.keys.reverb / 100, fx.keys.delay / 100, fx.keys.chorus / 100);
  return out;
}

export function uglyFxJson(fx: FxState, bpm: number): string {
  return JSON.stringify({ values: uglyFxValues(fx, bpm) });
}

export function panText(v: number): string {
  if (v === 0) return 'Centre';
  return v < 0 ? `Left ${-v}` : `Right ${v}`;
}
