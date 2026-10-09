/**
 * MidiDancer: improvises short single-note phrases on the key's scale, as a call and response.
 * It plays a phrase (the call), then stays quiet for as many complete bars as the phrase took up
 * (the response space, for the live player). Pure functions only: JS builds a small pool of phrases
 * (seeded, so the same settings always give the same phrases) and the native engine plays them on
 * the bar grid, so the timing is exact. Freeze does NOT pause it (it is for frozen scenes).
 *
 * Time is in 16th-note steps from the bar line a call starts on; a bar is 16 steps.
 */
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
export const PICK_NAMES = ['In turn', 'At random', 'The same one every time'];

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
  spaceMult: number; // 1-4, response space = this many times the bars the phrase takes
  pick: number; // 0 in turn, 1 random, 2 the same one every time
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
  spaceMult: 1,
  pick: 1,
  seed: 1,
};

/** A phrase: `span` complete bars, and events [step, length in steps, MIDI note, velocity]. */
export type Phrase = { span: number; events: number[][] };

export const PHRASES_IN_POOL = 8;

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
export function makePhrase(d: DancerState, mode: number, root: number, rng: () => number): Phrase {
  const intervals = SCALES[resolveScale(d.scale, mode)].intervals;
  const tones = scaleTones(root, intervals, d.register, d.octaves);
  if (tones.length === 0) return { span: 1, events: [] };

  const count = clamp(Math.round(2 + (clamp(d.density, 0, 100) / 100) * 8), 2, 10);
  const top = tones.length - 1;

  // Pitches, as positions in the tone list.
  const third = Math.max(0, Math.floor(top / 3));
  let pos =
    d.contour === 1 ? Math.floor(rng() * (third + 1))
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

  return { span: Math.max(1, Math.ceil(end / 16)), events };
}

/** The pool of phrases the engine picks from. The same settings always give the same pool. */
export function makePhrases(d: DancerState, mode: number, root: number): Phrase[] {
  const out: Phrase[] = [];
  for (let i = 0; i < PHRASES_IN_POOL; i++) {
    out.push(makePhrase(d, mode, root, mulberry32(Math.imul(Math.round(d.seed) + 1, 7919) + i * 104729)));
  }
  return out;
}

/** Bars from one call to the next: the phrase, then the response space. */
export function cycleBars(span: number, spaceMult: number): number {
  return Math.max(1, span) * (1 + Math.max(1, spaceMult));
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** A sentence describing a phrase, so it can be checked without hearing it. */
export function describePhrase(p: Phrase, spaceMult: number): string {
  if (p.events.length === 0) return 'No notes (the range is empty)';
  const notes = p.events.map((e) => NAMES[e[2] % 12]).join(' ');
  const first = p.events[0][0];
  const bars = p.span === 1 ? '1 bar' : `${p.span} bars`;
  const space = p.span * Math.max(1, spaceMult);
  return `${notes}. Starts on beat ${Math.floor(first / 4) + 1}${first % 4 ? ' and a bit' : ''}, takes ${bars}, then ${space} ${space === 1 ? 'bar' : 'bars'} of space for you`;
}
