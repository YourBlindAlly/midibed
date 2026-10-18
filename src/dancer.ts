/**
 * MidiDancer: improvises short single-note phrases on the key's scale, as a call and response.
 * It plays a phrase (the call), then stays quiet for as many complete bars as the phrase took up
 * (the response space, for the live player). Pure functions only: JS builds a small pool of phrases
 * (seeded, so the same settings always give the same phrases) and the native engine plays them on
 * the bar grid, so the timing is exact. Freeze does NOT pause it (it is for frozen scenes).
 *
 * Time is in 16th-note steps from the bar line a call starts on; a bar is 16 steps.
 */
import { MODE_INTERVALS, clampMode } from './chords';

export type Scale = { name: string; intervals: number[]; note: string };

// Canonical music-theory scales (no maker-specific handpan layouts). Index 0 is "Automatic"
// (chosen by the scene's mode). New scales go at the END so a saved number keeps its meaning.
export const SCALES: Scale[] = [
  { name: 'Automatic', intervals: [], note: 'Chooses a pentatonic scale to suit the mode' },
  { name: 'Natural minor (Kurd)', intervals: [0, 2, 3, 5, 7, 8, 10], note: 'Seven notes, warm and sad' },
  { name: 'Phrygian dominant (Hijaz)', intervals: [0, 1, 4, 5, 7, 8, 10], note: 'Eastern colour; best over a steady drone' },
  { name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], note: 'Minor with a leading note' },
  { name: 'Double harmonic major (Byzantine)', intervals: [0, 1, 4, 5, 7, 8, 11], note: 'Two augmented seconds; best over a steady drone' },
  { name: 'Whole tone', intervals: [0, 2, 4, 6, 8, 10], note: 'Floating, no home; best over a steady drone' },
  { name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9], note: 'Open and bright' },
  { name: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10], note: 'Plain and safe over minor and Dorian' },
  { name: 'Egyptian (suspended) pentatonic', intervals: [0, 2, 5, 7, 10], note: 'Unresolved, suits Mixolydian and drones' },
  { name: 'Man Gong (blues minor) pentatonic', intervals: [0, 3, 5, 8, 10], note: 'Darker minor' },
  { name: 'Hirajoshi', intervals: [0, 2, 3, 7, 8], note: 'Japanese, dark and still' },
  { name: 'In-sen', intervals: [0, 1, 5, 7, 10], note: 'Japanese, suits Phrygian' },
  { name: 'Iwato', intervals: [0, 1, 5, 6, 10], note: 'Japanese, tense' },
  { name: 'Yo', intervals: [0, 2, 5, 7, 9], note: 'Japanese, light and folk-like' },
];

// What Automatic picks for each mode (indexes into MODE_NAMES): Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian.
const AUTO_SCALE = [6, 7, 11, 6, 8, 7];

export function resolveScale(scale: number, mode: number): number {
  if (scale > 0 && scale < SCALES.length) return scale;
  return AUTO_SCALE[Math.max(0, Math.min(AUTO_SCALE.length - 1, Math.round(mode)))];
}

export const CONTOUR_NAMES = ['Free', 'Rising', 'Falling', 'Arch'];
export const START_NAMES = ['On the downbeat', 'Anywhere in the bar'];
/** Which note a phrase begins on. */
export const START_NOTE_NAMES = ['Where the contour leans', 'Any note of the scale', 'Spread out: each phrase starts on a different note'];
export const PICK_NAMES = ['In turn', 'At random', 'The same one every time', 'Back and forth, sparse to busy'];
export const DANCER_MODE_NAMES = ['Call and response', 'Solo, plays by itself'];
export const VIBRATO_MODE_NAMES = ['Pitch bend', 'Mod wheel (CC 1)'];

export type DancerState = {
  enabled: boolean;
  /** 0-based MIDI channel (global routing, not saved in a scene). */
  channel: number;
  scale: number; // index into SCALES; 0 = automatic
  density: number; // percent: how many notes in a phrase (2 to 10)
  busyness: number; // percent: how many of the notes are short
  rests: number; // percent chance of a gap before each note
  contour: number; // 0 free, 1 rising, 2 falling, 3 arch
  octaves: number; // 1-3, width of the range
  register: number; // MIDI note the range is centred on
  velocity: number;
  maxBars: number; // 1-4, the longest a phrase may run
  start: number; // 0 downbeat, 1 anywhere in the bar
  /** 0 the contour decides (as before), 1 any note of the scale, 2 spread out so the phrases of the pool start on different notes. */
  startNote: number;
  /** Beats the last note of a phrase is held for at least (0 = as the phrase made it). It rings on into the response space, never into the next phrase. */
  lastHold: number;
  /** How many of the final notes are played progressively softer (0 = off): the last one is the softest. This changes each note's velocity, so it is not a volume fade. */
  fadeNotes: number;
  /** Percent the very last note is softer than a normal note (the notes before it step down toward it). */
  fadeDepth: number;
  /** Percent chance that a short note is nudged to a nearby note of the mode that the pentatonic scale leaves out (0 = never). */
  colour: number;
  spaceMult: number; // 1-4, response space = this many times the bars the phrase takes
  pick: number; // 0 in turn, 1 random, 2 the same one every time, 3 back and forth through the pool
  /** 0 call and response (a gap for the player), 1 solo (keeps playing by itself). */
  mode: number;
  /** Solo: whole bars of rest between phrases (0 = the next phrase follows straight on). */
  restBars: number;
  /** Solo: how much sparser the quietest phrases are than the busiest, in percent (they are picked from the pool). */
  thin: number;
  /** Solo: keep going through a scene change instead of starting again on its first bar. */
  carryOn: boolean;
  /** 0-100: how much consecutive notes are joined (0 detached, 100 each note holds until the next begins). */
  legato: number;
  /** 0-100: how much the loudness varies from note to note, like breath pressure. */
  humanize: number;
  /** Vibrato depth in cents (0 = off), rate in tenths of a hertz, and how long after a note starts it begins (ms). */
  vibratoDepth: number;
  vibratoRate: number;
  vibratoDelay: number;
  /** 0 sent as pitch bend (works with any synth), 1 sent as the mod wheel (CC 1: the synth makes its own vibrato). */
  vibratoMode: number;
  /** The pitch bend range of the receiving sound, in semitones (the usual default is 2). */
  bendRange: number;
  /** Percent of notes that get a bend. */
  bendChance: number;
  /** Scoop: start this many cents below the note and slide up over scoopTime ms (0 = none). */
  scoop: number;
  scoopTime: number;
  /** Fall off: drop this many cents over the last fallTime ms of a note (0 = none). Only at the END of a phrase (before a rest), never in the middle of a joined run. */
  fall: number;
  fallTime: number;
  /** Dip: on occasional long notes (a beat and a half or more) the pitch sags by this many cents and recovers (0 = none). */
  dip: number;
  /** Percent of long notes that get a dip. */
  dipChance: number;
  /** How long the sag takes, each way, in ms. */
  dipTime: number;
  seed: number; // change it to get different phrases
};

export const defaultDancer: DancerState = {
  enabled: false,
  channel: 3,
  scale: 0,
  density: 40,
  busyness: 30,
  rests: 30,
  contour: 3,
  octaves: 1,
  register: 72,
  velocity: 70,
  maxBars: 2,
  start: 1,
  startNote: 2,
  colour: 0,
  lastHold: 0,
  fadeNotes: 0,
  fadeDepth: 40,
  spaceMult: 1,
  pick: 1,
  mode: 0,
  restBars: 1,
  thin: 40,
  carryOn: true,
  legato: 50,
  humanize: 30,
  vibratoDepth: 0,
  vibratoRate: 50,
  vibratoDelay: 300,
  vibratoMode: 0,
  bendRange: 2,
  bendChance: 50,
  scoop: 0,
  scoopTime: 120,
  fall: 0,
  fallTime: 150,
  dip: 0,
  dipChance: 30,
  dipTime: 180,
  seed: 1,
};

/** A phrase: `span` complete bars, and events [step, length in steps, MIDI note, velocity]. */
export type Phrase = { span: number; events: number[][] };

export const PHRASES_IN_POOL = 12;

/** Small, fast, seedable random numbers (0 up to but not including 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every note of the scale within the range, low to high. */
export function scaleTones(root: number, intervals: number[], register: number, octaves: number): number[] {
  const half = Math.max(1, Math.min(3, Math.round(octaves))) * 6;
  const lo = Math.max(0, Math.round(register) - half);
  const hi = Math.min(127, Math.round(register) + half);
  const out: number[] = [];
  for (let n = lo; n <= hi; n++) {
    const pc = (((n - root) % 12) + 12) % 12;
    if (intervals.includes(pc)) out.push(n);
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * One phrase. The pitches wander mostly by step along the scale, leaning the way the contour says,
 * and the last note lands on the scale's 2nd or 5th: a question, not an ending. The rhythm is built
 * from the busyness (short notes against long) and rests; the phrase starts on the downbeat or
 * anywhere in its first bar, and is cut off if it would run past maxBars.
 */
export function makePhrase(d: DancerState, mode: number, root: number, rng: () => number, startPos?: number): Phrase {
  const intervals = SCALES[resolveScale(d.scale, mode)].intervals;
  const tones = scaleTones(root, intervals, d.register, d.octaves);
  if (tones.length === 0) return { span: 1, events: [] };

  const count = clamp(Math.round(2 + (clamp(d.density, 0, 100) / 100) * 8), 2, 10);
  const top = tones.length - 1;

  // Pitches, as positions in the tone list.
  const third = Math.max(0, Math.floor(top / 3));
  let pos =
    d.startNote === 1 ? Math.floor(rng() * (top + 1))
    : d.startNote === 2 && startPos !== undefined ? clamp(Math.round(startPos), 0, top)
    : d.contour === 1 ? Math.floor(rng() * (third + 1))
    : d.contour === 2 ? top - Math.floor(rng() * (third + 1))
    : d.contour === 3 ? clamp(Math.round(top / 2 + (rng() - 0.5) * third), 0, top)
    : Math.floor(rng() * (top + 1));
  const idx: number[] = [pos];
  for (let i = 1; i < count; i++) {
    const up =
      d.contour === 1 ? 0.75
      : d.contour === 2 ? 0.25
      : d.contour === 3 ? (i < count / 2 ? 0.75 : 0.25)
      : 0.5;
    const size = rng() < 0.7 ? 1 : 2;
    let next = pos + (rng() < up ? size : -size);
    if (next < 0) next = Math.min(top, -next); // bounce off the bottom
    if (next > top) next = Math.max(0, 2 * top - next); // and the top
    pos = clamp(next, 0, top);
    idx.push(pos);
  }

  // Rhythm.
  const limit = clamp(Math.round(d.maxBars), 1, 4) * 16;
  let cursor = d.start === 0 ? 0 : Math.floor(rng() * 16);
  const events: number[][] = [];
  let end = 0;
  for (let i = 0; i < idx.length; i++) {
    if (i > 0 && rng() < clamp(d.rests, 0, 100) / 100) cursor += 1 + Math.floor(rng() * 4);
    const short = rng() < clamp(d.busyness, 0, 100) / 100;
    let len = short ? (rng() < 0.5 ? 1 : 2) : [4, 6, 8][Math.floor(rng() * 3)];
    if (i === idx.length - 1) len = Math.max(len, 4); // the question note is held
    if (cursor + len > limit) {
      if (events.length === 0) len = Math.max(1, limit - cursor); // always keep at least one note
      else break;
    }
    if (cursor >= limit) break;
    const vel = clamp(Math.round(d.velocity - rng() * 15 + (i === 0 ? 5 : 0)), 1, 127);
    events.push([cursor, len, tones[idx[i]], vel]);
    cursor += len;
    end = cursor;
  }

  // Passing notes: a short note is sometimes nudged to a close note of the mode that this (pentatonic) scale
  // leaves out, so the line gains a few more notes that still belong to the root and the mode. Never the held
  // last note, and the generator is not asked for a number unless this is on, so a phrase is unchanged when off.
  const chance = clamp(d.colour ?? 0, 0, 100) / 100;
  const modeIntervals = MODE_INTERVALS[clampMode(mode)];
  const missing = modeIntervals.filter((iv) => !intervals.includes(iv));
  if (chance > 0 && missing.length > 0 && intervals.length < 7) {
    events.forEach((e, i) => {
      if (i === events.length - 1 || e[1] > 2) return;
      if (rng() >= chance) return;
      const near = [-1, 1, -2, 2].map((dn) => e[2] + dn).filter((n) => missing.includes((((n - root) % 12) + 12) % 12));
      if (near.length > 0) e[2] = near[0];
    });
  }

  // The last note lands on the 2nd or the 5th of the scale (the nearest one to where it was).
  if (events.length > 0) {
    const last = events[events.length - 1];
    const fifth = intervals.reduce((best, v) => (Math.abs(v - 7) < Math.abs(best - 7) ? v : best), intervals[0]);
    const targets = [intervals[1] ?? intervals[0], fifth];
    const want = targets[rng() < 0.5 ? 0 : 1];
    const choices = tones.filter((n) => (((n - root) % 12) + 12) % 12 === want);
    if (choices.length > 0) {
      last[2] = choices.reduce((best, n) => (Math.abs(n - last[2]) < Math.abs(best - last[2]) ? n : best), choices[0]);
    }
  }

  // Humanize: a breath-like swell across the phrase plus a little per-note variation. With zero it
  // changes nothing, so older phrases are unchanged.
  const h = clamp(d.humanize ?? 0, 0, 100) / 100;
  if (h > 0) {
    const n = events.length;
    events.forEach((e, i) => {
      const pos = n > 1 ? i / (n - 1) : 0.5;
      const breath = Math.sin(Math.PI * pos); // 0 at the ends, 1 in the middle
      const swell = 1 - h * 0.25 + h * 0.35 * breath;
      e[3] = clamp(Math.round(e[3] * swell + (rng() - 0.5) * h * 30), 1, 127);
    });
  }

  const span = Math.max(1, Math.ceil(end / 16));

  // A long last note: held for at least lastHold beats, but never past the quiet that follows the phrase
  // (the response space, or the rest in solo mode), so it cannot run into the next phrase. The phrase's own
  // span, and so the gap for the player, is unchanged.
  const holdSteps = clamp(Math.round(d.lastHold ?? 0), 0, 32) * 4;
  if (holdSteps > 0 && events.length > 0) {
    const last = events[events.length - 1];
    const cycle = d.mode === 1 ? soloBars(span, d.restBars) : cycleBars(span, d.spaceMult);
    const room = Math.max(last[1], cycle * 16 - last[0] - 2);
    last[1] = Math.max(last[1], Math.min(holdSteps, room));
  }

  // Softer final notes: each of the last few notes is played at a lower velocity than the one before, the last
  // the softest, so the playing eases off by itself without any volume fade.
  const softCount = clamp(Math.round(d.fadeNotes ?? 0), 0, 6);
  const softDepth = clamp(d.fadeDepth ?? 0, 0, 90) / 100;
  if (softCount > 0 && softDepth > 0 && events.length > 0) {
    const n = events.length;
    const k = Math.min(softCount, n);
    for (let j = 1; j <= k; j++) {
      const e = events[n - k + j - 1];
      e[3] = clamp(Math.round(e[3] * (1 - (softDepth * j) / k)), 1, 127);
    }
  }

  return { span, events };
}

/** The pool of phrases the engine picks from. The same settings always give the same pool. */
export function makePhrases(d: DancerState, mode: number, root: number): Phrase[] {
  const out: Phrase[] = [];
  // Spread out: the phrases start on different notes. The order is a seeded shuffle of the scale's tones, so
  // the same settings still give the same phrases.
  const toneCount = scaleTones(root, SCALES[resolveScale(d.scale, mode)].intervals, d.register, d.octaves).length;
  const order = Array.from({ length: Math.max(1, toneCount) }, (_, k) => k);
  const shuffle = mulberry32(Math.imul(Math.round(d.seed) + 1, 6007));
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(shuffle() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  for (let i = 0; i < PHRASES_IN_POOL; i++) {
    // In solo mode the pool runs from sparse to busy, so picking back and forth through it makes the
    // playing thin out and fill in over time. The last phrase is always at the density you set.
    const scale = d.mode === 1 ? 1 - (Math.max(0, Math.min(100, d.thin)) / 100) * (1 - i / (PHRASES_IN_POOL - 1)) : 1;
    const dd = scale === 1 ? d : { ...d, density: d.density * scale };
    out.push(makePhrase(dd, mode, root, mulberry32(Math.imul(Math.round(d.seed) + 1, 7919) + i * 104729), order[i % order.length]));
  }
  return out;
}

/** Bars from one call to the next: the phrase, then the response space. */
export function cycleBars(span: number, spaceMult: number): number {
  return Math.max(1, span) * (1 + Math.max(1, spaceMult));
}

/** Bars from the start of one solo phrase to the start of the next: the phrase, then the rest. */
export function soloBars(span: number, restBars: number): number {
  return Math.max(1, span) + Math.max(0, Math.round(restBars));
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** A sentence describing a phrase, so it can be checked without hearing it. */
export function describePhrase(p: Phrase, spaceMult: number, mode = 0, restBars = 1): string {
  if (p.events.length === 0) return 'No notes (the range is empty)';
  const notes = p.events.map((e) => NAMES[e[2] % 12]).join(' ');
  const first = p.events[0][0];
  const bars = p.span === 1 ? '1 bar' : `${p.span} bars`;
  const start = `Starts on beat ${Math.floor(first / 4) + 1}${first % 4 ? ' and a bit' : ''}, takes ${bars}`;
  if (mode === 1) {
    const rest = Math.max(0, Math.round(restBars));
    return `${notes}. ${start}, then ${rest === 0 ? 'the next phrase follows straight on' : `${rest} ${rest === 1 ? 'bar' : 'bars'} of rest`}`;
  }
  const space = p.span * Math.max(1, spaceMult);
  return `${notes}. ${start}, then ${space} ${space === 1 ? 'bar' : 'bars'} of space for you`;
}
