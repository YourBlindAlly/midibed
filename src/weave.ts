// MidiWeave: hypnotic, strictly rhythmic melodic lines that repeat and change slowly (Rusty's name, 2026-11-09).
//
// Two lines, each its own loop length (so they drift against each other). A line is a rhythm (a library rhythm or the
// Euclidean spread) plus a melody of scale degrees; the melody and the rhythm change a little at a time while the loop
// goes round:
//  - scheduled changes: every `changeEvery` loops, with a chance, ONE small change (a note moves a scale step, a hit
//    shifts, is added or is taken away); after `returnAfter` changes the line goes home to its starting pattern;
//  - a Turing-machine style lock dial: fully locked (100) never drifts by itself; lower values let each note
//    wander a step now and then.
// The native engine (MidiBedEngine.swift, stepWeave / weaveMutate) plays and mutates; this file makes the starting
// pattern and holds the reference for the change rules, which the Swift mirrors exactly (tested here).

import { SCALES, mulberry32, resolveScale } from './dancer';
import { euclidHit } from './euclid';
import { RHYTHMS, clampRhythm } from './rhythms';

export const WEAVE_PITCH_NAMES = ['Scale only (over a drone)', 'Follow the chords'];
export const MAX_WEAVE_STEPS = 32;

export type WeaveLine = {
  on: boolean;
  /** Loop length in sixteenth notes (4-32). A library rhythm brings its own length. */
  steps: number;
  /** 0 = the Euclidean spread (hits, steps, rotation); else a rhythm from the library. */
  rhythm: number;
  hits: number;
  rotation: number;
  /** Octaves above the register (-1 to 2). */
  octave: number;
  velocity: number;
  /** Percent of the gap to the next note that a note lasts. */
  length: number;
  /** How many scale steps (or chord tones) the melody ranges over, 3-12. */
  spread: number;
  /** Seed for the starting melody. */
  seed: number;
  /** 0-100: 100 = never drifts by itself; lower lets notes wander a step now and then. */
  lock: number;
  /** One small change every this many loops (0 = off). */
  changeEvery: number;
  /** Percent chance that the scheduled change happens. */
  changeChance: number;
  /** After this many scheduled changes the line goes home (0 = never). */
  returnAfter: number;
};

export type WeaveState = {
  /** The layer is on. Scene-owned. */
  enabled: boolean;
  /** MIDI channel (0-based). Default is the Keys' channel, so the built-in electric piano plays it. Global. */
  channel: number;
  /** 0 = scale only, 1 = follow the chords. */
  pitch: number;
  /** An index into the MidiDancer scales (0 = automatic for the mode). */
  scale: number;
  /** The lowest note (MIDI). */
  register: number;
  lines: WeaveLine[];
};

export const defaultWeaveLine1: WeaveLine = {
  on: true,
  steps: 16,
  rhythm: 0,
  hits: 6,
  rotation: 0,
  octave: 0,
  velocity: 70,
  length: 60,
  spread: 6,
  seed: 11,
  lock: 85,
  changeEvery: 4,
  changeChance: 60,
  returnAfter: 6,
};

export const defaultWeaveLine2: WeaveLine = {
  on: false,
  steps: 12,
  rhythm: 0,
  hits: 4,
  rotation: 2,
  octave: 1,
  velocity: 55,
  length: 60,
  spread: 5,
  seed: 29,
  lock: 90,
  changeEvery: 6,
  changeChance: 50,
  returnAfter: 5,
};

export const defaultWeave: WeaveState = {
  enabled: false,
  channel: 4,
  pitch: 0,
  scale: 0,
  register: 60,
  lines: [{ ...defaultWeaveLine1 }, { ...defaultWeaveLine2 }],
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** The loop length of a line, in sixteenths. */
export function lineSteps(l: WeaveLine): number {
  return l.rhythm > 0 ? RHYTHMS[clampRhythm(l.rhythm)].steps : clamp(Math.round(l.steps), 4, MAX_WEAVE_STEPS);
}

/** Which steps of the loop hit (rotation included). */
export function lineHits(l: WeaveLine): boolean[] {
  const n = lineSteps(l);
  const base: boolean[] = [];
  if (l.rhythm > 0) {
    const r = RHYTHMS[clampRhythm(l.rhythm)];
    for (let k = 0; k < n; k++) base.push(r.hits.includes(k));
  } else {
    const hits = clamp(Math.round(l.hits), 0, n);
    for (let k = 0; k < n; k++) base.push(euclidHit(k, hits, n));
  }
  const rot = ((Math.round(l.rotation) % n) + n) % n;
  return base.map((_, s) => base[(((s - rot) % n) + n) % n]);
}

/** Bit n set where step n hits (2 ** n, so a 32 step loop is safe). */
export function hitsMask(hits: boolean[]): number {
  let m = 0;
  hits.forEach((h, k) => {
    if (h) m += 2 ** k;
  });
  return m;
}

/**
 * The starting melody: a scale degree (0 = the home note) for every step, a gentle walk with the odd leap. Only the steps
 * that hit are heard, but every step has a degree so a hit can be added later.
 */
export function lineDegrees(l: WeaveLine): number[] {
  const n = lineSteps(l);
  const spread = clamp(Math.round(l.spread), 3, 12);
  const rng = mulberry32(Math.round(l.seed) * 7919 + n * 131 + 17);
  const out: number[] = [];
  let d = 0;
  for (let s = 0; s < n; s++) {
    if (s > 0) {
      const r = rng();
      let step = 0;
      if (r < 0.15) step = rng() < 0.5 ? -3 : 3;
      else if (r < 0.4) step = -1;
      else if (r < 0.65) step = 1;
      else if (r < 0.75) step = -2;
      else if (r < 0.85) step = 2;
      d = clamp(d + step, 0, spread - 1);
    }
    out.push(d);
  }
  return out;
}

/** The scale's notes within one octave, from the scene's mode. */
export function weaveIntervals(w: WeaveState, mode: number): number[] {
  return SCALES[resolveScale(w.scale, mode)].intervals;
}

/** The lowest note at or above the register that is the key's note. */
export function weaveBase(register: number, keyNote: number): number {
  const pc = ((keyNote % 12) + 12) % 12;
  return register + ((((pc - register) % 12) + 12) % 12);
}

// ---- The rules for change. Swift mirrors these in weaveMutate. `rand` returns 0 to under 1.

export type WeaveRuntime = { deg: number[]; hit: boolean[]; loops: number; changes: number };
export type WeaveChangeRules = { spread: number; lock: number; changeEvery: number; changeChance: number; returnAfter: number };

export function startRuntime(deg: number[], hit: boolean[]): WeaveRuntime {
  return { deg: [...deg], hit: [...hit], loops: 0, changes: 0 };
}

/** One small scheduled change. The first hit is never moved or removed, so the line keeps its anchor. */
export function applyOneChange(rt: WeaveRuntime, spread: number, rand: () => number): void {
  const n = rt.hit.length;
  const hitIdx = rt.hit.map((h, k) => (h ? k : -1)).filter((k) => k >= 0);
  if (hitIdx.length === 0) return;
  const anchor = hitIdx[0];
  const movable = hitIdx.filter((k) => k !== anchor);
  const r = rand();
  const top = Math.max(0, spread - 1);
  if (r < 0.55) {
    const s = hitIdx[Math.floor(rand() * hitIdx.length)];
    const dir = rand() < 0.5 ? -1 : 1;
    const amount = rand() < 0.1 ? 2 : 1;
    rt.deg[s] = clamp(rt.deg[s] + dir * amount, 0, top);
  } else if (r < 0.8) {
    if (movable.length === 0) return;
    const s = movable[Math.floor(rand() * movable.length)];
    const to = s + (rand() < 0.5 ? -1 : 1);
    if (to > anchor && to < n && !rt.hit[to]) {
      rt.hit[s] = false;
      rt.hit[to] = true;
      rt.deg[to] = rt.deg[s];
    }
  } else if (r < 0.9) {
    const empty = rt.hit.map((h, k) => (!h ? k : -1)).filter((k) => k >= 0);
    if (empty.length === 0 || hitIdx.length >= Math.max(3, Math.floor(n / 2))) return;
    const e = empty[Math.floor(rand() * empty.length)];
    rt.hit[e] = true;
    rt.deg[e] = clamp(rt.deg[(e + n - 1) % n] + (rand() < 0.5 ? -1 : 1), 0, top);
  } else {
    if (hitIdx.length <= 2 || movable.length === 0) return;
    const s = movable[Math.floor(rand() * movable.length)];
    rt.hit[s] = false;
  }
}

/** Called when a line's loop comes round to its start (not the very first time). */
export function mutateAtLoop(rt: WeaveRuntime, orig: WeaveRuntime, rules: WeaveChangeRules, rand: () => number): void {
  rt.loops += 1;
  if (rules.returnAfter > 0 && rt.changes >= rules.returnAfter) {
    rt.deg = [...orig.deg];
    rt.hit = [...orig.hit];
    rt.changes = 0;
    return;
  }
  const top = Math.max(0, rules.spread - 1);
  if (rules.changeEvery > 0 && rt.loops % rules.changeEvery === 0 && rand() * 100 < rules.changeChance) {
    applyOneChange(rt, rules.spread, rand);
    rt.changes += 1;
  }
  const p = ((100 - rules.lock) / 100) * 0.2;
  if (p > 0) {
    for (let s = 0; s < rt.hit.length; s++) {
      if (rt.hit[s] && rand() < p) {
        const dir = rand() < 0.5 ? -1 : 1;
        const amount = rand() < 0.3 ? 2 : 1;
        rt.deg[s] = clamp(rt.deg[s] + dir * amount, 0, top);
      }
    }
  }
}

/** The MIDI note for a degree: the scale's notes, or the chord's notes, above the base note. */
export function weaveNote(degree: number, octave: number, base: number, intervals: number[], chord: number[] | null): number {
  const d = Math.max(0, Math.round(degree));
  if (chord && chord.length > 0) {
    const sorted = [...chord].sort((a, b) => a - b);
    return clamp(sorted[d % sorted.length] + 12 * Math.floor(d / sorted.length) + 12 * octave, 0, 127);
  }
  const n = intervals.length;
  return clamp(base + intervals[d % n] + 12 * Math.floor(d / n) + 12 * octave, 0, 127);
}

/** A short spoken description of a line. */
export function describeLine(l: WeaveLine): string {
  if (!l.on) return 'off';
  const hits = lineHits(l).filter(Boolean).length;
  const change = l.changeEvery > 0 ? `a change every ${l.changeEvery} loops` : 'no scheduled change';
  return `${hits} notes in ${lineSteps(l)} steps, ${change}, lock ${l.lock}`;
}
