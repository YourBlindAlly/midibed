// Bass rhythm: the bass drone can play notes locked to the kick pattern instead of holding one note.
// This file is the tested reference; MidiBedEngine.swift (stepBassRhythm) must behave the same.
//
// The kick is described here by the steps it hits in a loop of `steps` sixteenths. Mode 1 plays a bass
// note on each kick hit (optionally only every other hit); mode 2 plays one note halfway between each pair
// of kick hits (the offbeat gap). A note lasts a share (lengthPct) of the distance to the next kick hit.

import { BassChordParams, chordStack, MAX_CHORDS } from './chords';

export const BASS_RHYTHM_NAMES = ['Steady drone', 'Plays on the kick', 'Plays between the kicks'];
export const BASS_NOTES_NAMES = ['Root only', 'All the bass notes', 'Root, with the octave on every other note'];
export const BASS_SKIP_NAMES = ['Every kick', 'Every other kick'];

export type BassStep = { step: number; gap: number };

export function bassRhythmSteps(hits: number[], steps: number, mode: number, skip: number): BassStep[] {
  const sorted = Array.from(new Set(hits.map((h) => ((h % steps) + steps) % steps))).sort((a, b) => a - b);
  if (sorted.length === 0 || steps < 1 || mode < 1) return [];
  const out: BassStep[] = [];
  sorted.forEach((h, k) => {
    const next = sorted[(k + 1) % sorted.length];
    const gap = next > h ? next - h : next + steps - h; // a single hit: the whole loop
    if (mode === 1) {
      if (skip === 1 && k % 2 === 1) return;
      out.push({ step: h, gap });
    } else if (mode === 2 && gap >= 2) {
      const a = Math.ceil(gap / 2); // steps after this hit
      out.push({ step: (h + a) % steps, gap: gap - a });
    }
  });
  return out.sort((x, y) => x.step - y.step);
}

/** How long a bass note lasts, in seconds, given the steps to the next kick hit and the share of that gap. */
export function bassNoteSeconds(gapSteps: number, stepSeconds: number, lengthPct: number): number {
  return Math.max(0.03, gapSteps * stepSeconds * (lengthPct / 100) - 0.003);
}

// ---- Colour notes: now and then the rhythmic bass plays a different note instead of the chord's root.
// The notes are worked out here for every chord (so the engine only has to pick one); the first note of
// each bar always stays on the root.

export const COLOR_STEP_NAMES = ['A whole step below the root', 'The next note down the scale'];

export type BassColorParams = BassChordParams & {
  /** Allow a note below the root. */
  below: boolean;
  /** 0 a whole step (two semitones) below, 1 the next note down the scale (a half or whole step). */
  stepKind: number;
  /** Allow the root of the related key (a minor third up from a minor chord, down from a major one). */
  relRoot: boolean;
  /** Allow the third of the related key (up a fifth from a minor chord; a major chord's own third). */
  relThird: boolean;
};

/**
 * For each chord of the loop (the same chords buildBassChords makes): the bass colour notes allowed.
 * With a minor chord such as A minor: G below, C (the root of the related major) and E (its third, the
 * fifth of A minor). With a major chord such as C major: B-flat or B below, A (the related minor's root)
 * and E (the chord's own third).
 */
export function buildBassColorNotes(p: BassColorParams): number[][] {
  const count = Math.max(1, Math.min(MAX_CHORDS, p.count));
  const degrees = p.follow ? p.degrees.slice(0, count) : [1];
  return degrees.map((d, i) => {
    const colour = p.follow ? (p.colors?.[i] ?? 0) : 0;
    const stack = chordStack(p.root, p.mode, d, 0, colour);
    const folded = p.root + ((((stack[0] - p.root + 5) % 12) + 12) % 12) - 5;
    const base = p.follow ? folded : p.root;
    const minor = stack[1] - stack[0] <= 3;
    const out: number[] = [];
    if (p.below) {
      if (p.stepKind === 1) {
        const prevDegree = d <= 1 ? 7 : d - 1;
        const prevRoot = chordStack(p.root, p.mode, prevDegree, 0, 0)[0];
        const down = (((stack[0] - prevRoot) % 12) + 12) % 12;
        out.push(base - (down === 0 ? 2 : down));
      } else {
        out.push(base - 2);
      }
    }
    if (p.relRoot) out.push(minor ? base + 3 : base - 3);
    if (p.relThird) out.push(minor ? base + 7 : base + 4);
    return Array.from(new Set(out)).filter((n) => n >= 0 && n <= 127);
  });
}
