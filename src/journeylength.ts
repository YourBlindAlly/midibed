// How long a journey plays, worked out from its scenes' auto-advance settings (src/advance.ts). Every scene that
// moves on by itself plays an exact number of bars, and the tempo belongs to the whole journey, so the length is
// plain arithmetic. It cannot be known when a scene stays until you change it, when the order is left to chance, or
// when the scenes go round in a circle forever; in those cases it says how far it can tell.

import { AdvanceRule, advanceBars, pickTarget } from './advance';

export type LengthScene = {
  advance: AdvanceRule;
  harmony: { barsPerChord: number; count: number };
};

export type JourneyLength = {
  /**
   * ends: a scene ends the piece. stays: the last scene stays until you change it. repeats: the scenes go round for
   * ever. random: a scene picks the next one by chance, so the length is not fixed.
   */
  kind: 'ends' | 'stays' | 'repeats' | 'random';
  /** The scenes in the order they play, each with its bars. A scene that stays has 0 bars. */
  steps: { scene: number; bars: number }[];
  /** All the bars in `steps` (for 'repeats', the lead-in plus one round). */
  bars: number;
  /** For 'repeats': the bars in one round, and the index in `steps` where the round begins. */
  cycleBars: number;
  cycleStart: number;
};

/** Follow the scenes from `start`. `scenes` are the journey's scenes with the live scene's settings in place. */
export function journeyLength(scenes: LengthScene[], start: number): JourneyLength {
  const n = scenes.length;
  const steps: { scene: number; bars: number }[] = [];
  const seen = new Map<number, number>();
  let kind: JourneyLength['kind'] = 'stays';
  let cycleStart = 0;
  let cur = Math.max(0, Math.min(n - 1, start));
  for (let guard = 0; guard <= n + 1; guard++) {
    const sc = scenes[cur];
    if (seen.has(cur)) {
      kind = 'repeats';
      cycleStart = seen.get(cur) as number;
      break;
    }
    const rule = sc.advance;
    if (rule.mode === 0) {
      steps.push({ scene: cur, bars: 0 });
      kind = 'stays';
      break;
    }
    seen.set(cur, steps.length);
    steps.push({ scene: cur, bars: advanceBars(rule, sc.harmony) });
    if (rule.mode === 4) {
      kind = 'ends';
      break;
    }
    if (rule.mode === 3) {
      kind = 'random';
      break;
    }
    const next = pickTarget(rule, cur, n, 0);
    if (next < 0) {
      kind = 'stays';
      break;
    }
    cur = next;
  }
  const bars = steps.reduce((a, s) => a + s.bars, 0);
  const cycleBars = kind === 'repeats' ? steps.slice(cycleStart).reduce((a, s) => a + s.bars, 0) : 0;
  return { kind, steps, bars, cycleBars, cycleStart };
}

/** Seconds for a number of 4/4 bars at the tempo. */
export function barsToSeconds(bars: number, bpm: number): number {
  return (bars * 4 * 60) / Math.max(20, Math.min(300, bpm));
}

/** For example "3 minutes 23 seconds", "45 seconds". */
export function durationText(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const minutes = `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  const secs = `${s} ${s === 1 ? 'second' : 'seconds'}`;
  if (m === 0) return secs;
  return s === 0 ? minutes : `${minutes} ${secs}`;
}

const barsText = (n: number) => `${n} ${n === 1 ? 'bar' : 'bars'}`;

/** The sentence for the screen. `label(i)` names a scene ("scene 2" or "scene 2, the lift"). */
export function lengthSentence(len: JourneyLength, bpm: number, label: (i: number) => string): string {
  const first = len.steps[0]?.scene ?? 0;
  const span = (b: number) => `${barsText(b)}, ${durationText(barsToSeconds(b, bpm))}`;
  switch (len.kind) {
    case 'ends':
      return `From ${label(first)} the piece ends by itself after ${span(len.bars)}, plus the last chord ringing.`;
    case 'repeats': {
      const lead = len.steps.slice(0, len.cycleStart).reduce((a, s) => a + s.bars, 0);
      const round = `one round of the scenes is ${span(len.cycleBars)}, and then it goes round again for ever`;
      return lead > 0 ? `From ${label(first)}, ${barsText(lead)} lead in, then ${round}.` : `From ${label(first)}, ${round}.`;
    }
    case 'random': {
      const last = len.steps[len.steps.length - 1];
      return `From ${label(first)} the length is not fixed: after ${span(len.bars)} ${label(last.scene)} chooses the next scene by chance.`;
    }
    default: {
      const last = len.steps[len.steps.length - 1];
      if (len.steps.length === 1) return `${label(last.scene)} stays until you change it, so there is no fixed length.`;
      return `From ${label(first)} it takes ${span(len.bars)} to reach ${label(last.scene)}, which stays until you change it.`;
    }
  }
}

/** One line per scene: how long it plays. */
export function lengthBreakdown(len: JourneyLength, bpm: number, label: (i: number) => string): string {
  return len.steps
    .map((s) => (s.bars > 0 ? `${label(s.scene)}: ${barsText(s.bars)}, ${durationText(barsToSeconds(s.bars, bpm))}` : `${label(s.scene)}: stays`))
    .join('. ');
}
