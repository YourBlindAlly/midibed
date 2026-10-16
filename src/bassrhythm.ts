// Bass rhythm: the bass drone can play notes locked to the kick pattern instead of holding one note.
// This file is the tested reference; MidiBedEngine.swift (stepBassRhythm) must behave the same.
//
// The kick is described here by the steps it hits in a loop of `steps` sixteenths. Mode 1 plays a bass
// note on each kick hit (optionally only every other hit); mode 2 plays one note halfway between each pair
// of kick hits (the offbeat gap). A note lasts a share (lengthPct) of the distance to the next kick hit.

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
