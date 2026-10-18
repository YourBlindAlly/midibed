// Keys: a rhythmic electric-piano (Rhodes style) part that comps the chords of the harmony loop. It is its
// own part, like MidiDancer: its own MIDI channel, ports, outputs, effects and layer switch, and everything
// but the channel is saved per scene. The pad stays pure sustain; the keys are where the rhythm lives.
//
// The rhythm is a pattern of steps (sixteenths) from a small library of comping patterns, or an Euclidean
// generator (hits spread over steps, rotated) with the same extras the drums have (chance, ghost notes,
// accents, looseness). The native engine (MidiBedEngine.swift, stepKeys) plays it; this file is the tested
// reference for the pattern library and the settings.

export type KeysRhythm = { name: string; steps: number; hits: number[] };

// Index 0 is the generator (hits, steps and rotation are the player's own); the rest are fixed patterns.
// New patterns go at the END so a saved number keeps its meaning.
export const KEYS_RHYTHMS: KeysRhythm[] = [
  { name: 'Euclidean generator (hits, steps, rotation)', steps: 16, hits: [] },
  { name: 'Offbeat stabs', steps: 16, hits: [2, 6, 10, 14] },
  { name: 'Charleston', steps: 16, hits: [0, 6] },
  { name: 'Skank on 2 and 4', steps: 16, hits: [4, 12] },
  { name: 'Pushed', steps: 16, hits: [0, 6, 10, 14] },
  { name: 'Dotted eighths', steps: 16, hits: [0, 3, 6, 9, 12, 15] },
  { name: 'Tresillo', steps: 16, hits: [0, 3, 6, 8, 11, 14] },
  { name: 'Syncopated comp', steps: 16, hits: [0, 3, 6, 10, 12] },
  { name: 'Long and short', steps: 16, hits: [0, 10] },
  { name: 'Quarter notes', steps: 16, hits: [0, 4, 8, 12] },
  { name: 'Eighth notes', steps: 16, hits: [0, 2, 4, 6, 8, 10, 12, 14] },
  { name: 'Two-bar answer', steps: 32, hits: [0, 6, 10, 16, 22] },
  { name: 'Two-bar lilt', steps: 32, hits: [0, 3, 8, 14, 19, 24, 30] },
  // Sparser patterns, for keys that stay in the background.
  { name: 'Once a bar', steps: 16, hits: [0] },
  { name: 'Beats 1 and 3', steps: 16, hits: [0, 8] },
  { name: 'Beat 3 only', steps: 16, hits: [8] },
  { name: 'The and of 2', steps: 16, hits: [6] },
  { name: 'Slow offbeats', steps: 16, hits: [6, 14] },
  { name: 'Once in two bars', steps: 32, hits: [0] },
  { name: 'Two-bar slow', steps: 32, hits: [0, 22] },
];

/** What the keys play along with: their own pattern, or a drum's hits. */
export const KEYS_FOLLOW_NAMES = ['Its own pattern', 'On the kick', 'Between the kicks', 'On the snare'];
export const KEYS_SKIP_NAMES = ['Every hit', 'Every other hit'];

export function clampKeysRhythm(i: number): number {
  return Math.max(0, Math.min(KEYS_RHYTHMS.length - 1, Math.round(Number.isFinite(i) ? i : 0)));
}

/** The pattern as a number with bit n set when step n plays (steps up to 32, so not a 32-bit integer operation). */
export function keysMask(i: number): number {
  return KEYS_RHYTHMS[clampKeysRhythm(i)].hits.reduce((m, h) => m + 2 ** h, 0);
}

export type KeysState = {
  enabled: boolean;
  /** MIDI channel 0-15 (global routing, not saved in a scene). */
  channel: number;
  /** 0 = the generator below, else an index into KEYS_RHYTHMS. */
  rhythm: number;
  steps: number;
  hits: number;
  rotation: number;
  velocity: number;
  /** Percent chance each scheduled hit plays. */
  probability: number;
  /** Percent random softening of the hits. */
  humanize: number;
  ghostHits: number;
  ghostRotation: number;
  ghostVelocity: number;
  accentEvery: number;
  accentOffset: number;
  accentBoost: number;
  keepFirst: boolean;
  looseMs: number;
  /** Percent of the distance to the next hit that a chord rings. */
  length: number;
  /** Milliseconds between the notes of a chord, low to high (0 = all together). */
  strumMs: number;
  /** Lowest note of the keys' range. */
  register: number;
  /** Chord type, an index into STYLE_NAMES in chords.ts (triad, sus 2, sus 4, add 9, seventh, open fifth, fifth only). */
  style: number;
  voiceLead: boolean;
  /** Percent chance a hit plays the suspended (sus 4) version of its chord. */
  susChance: number;
  /** 0 the pattern above; 1 on the kick's hits; 2 between the kick's hits; 3 on the snare's hits (see KEYS_FOLLOW_NAMES). */
  follow: number;
  /** 0 every hit of the drum, 1 every other hit (follow 1 and 3). */
  followSkip: number;
};

export const defaultKeys: KeysState = {
  enabled: false,
  channel: 4,
  rhythm: 2,
  steps: 16,
  hits: 5,
  rotation: 0,
  velocity: 64,
  probability: 100,
  humanize: 25,
  ghostHits: 0,
  ghostRotation: 0,
  ghostVelocity: 35,
  accentEvery: 0,
  accentOffset: 0,
  accentBoost: 30,
  keepFirst: false,
  looseMs: 0,
  length: 55,
  strumMs: 12,
  register: 60,
  style: 0,
  voiceLead: true,
  susChance: 0,
  follow: 0,
  followSkip: 0,
};

/** The pattern as x and dots, for a screen reader (rotation applied; the generator shows its Euclidean spread). */
export function keysPatternText(k: Pick<KeysState, 'rhythm' | 'steps' | 'hits' | 'rotation'>): string {
  const lib = k.rhythm > 0 ? KEYS_RHYTHMS[clampKeysRhythm(k.rhythm)] : null;
  const n = Math.max(1, lib ? lib.steps : k.steps);
  const hits = lib ? lib.hits.length : Math.min(n, k.hits);
  let out = '';
  for (let step = 0; step < n; step++) {
    const pos = (((step - k.rotation) % n) + n) % n;
    const on = lib ? lib.hits.includes(pos) : hits > 0 && (pos * hits) % n < hits;
    out += on ? 'x' : '.';
  }
  return out;
}
