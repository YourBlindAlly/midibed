/**
 * Modal chord generation for the pad layer. Pure functions only: the native
 * engine just plays the note lists this produces, at bar boundaries.
 * Self-contained (no imports from config.ts, which imports this).
 */

// Locrian was dropped (2026-10-08): its tonic chord is diminished and a drone has no stable fifth there. A saved
// mode index above the last is clamped to the last (see clampMode).
export const MODE_NAMES = ['Ionian (major)', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian (minor)'];

export function clampMode(mode: number): number {
  return Math.max(0, Math.min(MODE_NAMES.length - 1, Math.round(Number.isFinite(mode) ? mode : 0)));
}

export const MODE_INTERVALS: number[][] = [
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 9, 10],
  [0, 1, 3, 5, 7, 8, 10],
  [0, 2, 4, 6, 7, 9, 11],
  [0, 2, 4, 5, 7, 9, 10],
  [0, 2, 3, 5, 7, 8, 10],
];

// New chord types go at the END so a saved style number keeps its meaning.
export const STYLE_NAMES = ['Triad', 'Sus 2', 'Sus 4', 'Add 9', 'Seventh', 'Open fifth', 'Fifth only'];

/** Scale-step offsets from the chord's degree for each chord type. */
const STYLE_STEPS: number[][] = [
  [0, 2, 4],
  [0, 1, 4],
  [0, 3, 4],
  [0, 2, 4, 8],
  [0, 2, 4, 6],
  [0, 4, 7],
  [0, 4],
];

/** `modes`: the modes (indexes into MODE_NAMES) this progression suits; left out = suits every mode. */
export type ChordPreset = { name: string; degrees: number[]; modes?: number[] };

/** Index 0 is "Custom": selecting it changes nothing. Degrees are 1-7. */
// Mode indexes: 0 Ionian (major), 1 Dorian, 2 Phrygian, 3 Lydian, 4 Mixolydian, 5 Aeolian (minor).
// New presets go at the END so a saved preset number keeps its meaning.
export const PRESETS: ChordPreset[] = [
  { name: 'Custom', degrees: [] },
  { name: 'Pedal, one chord', degrees: [1] },
  { name: 'Rock between two', degrees: [1, 7], modes: [1, 2, 4, 5] },
  { name: 'Lift', degrees: [1, 4], modes: [0, 1, 2, 4, 5] },
  { name: 'Fall', degrees: [1, 7, 6], modes: [2, 5] },
  { name: 'Folk turn', degrees: [1, 7, 4, 7], modes: [1, 4, 5] },
  { name: 'Descent', degrees: [1, 7, 6, 5], modes: [2, 5] },
  { name: 'Wide arc', degrees: [1, 3, 4, 5], modes: [1, 5] },
  { name: 'Four chords', degrees: [1, 5, 6, 4], modes: [0, 4] },
  { name: 'Plain', degrees: [1, 4, 5, 1], modes: [0] },
  { name: 'Gentle turn', degrees: [1, 6, 4, 5], modes: [0] },
  { name: 'Floating', degrees: [1, 2, 1, 5], modes: [3] },
  { name: 'Phrygian turn', degrees: [1, 2, 1, 7], modes: [2] },
];

/**
 * The preset numbers to offer for a mode: Custom, then every preset that suits the mode. The
 * preset already chosen is kept in the list even if it does not suit, so the screen never
 * shows a blank.
 */
export function presetsForMode(mode: number, current: number): number[] {
  const m = clampMode(mode);
  return PRESETS.map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i === 0 || i === current || !p.modes || p.modes.includes(m))
    .map(({ i }) => i);
}

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchClassName(note: number): string {
  return PC_NAMES[((Math.round(note) % 12) + 12) % 12];
}

/** MIDI note of scale step `index` (0-based, may exceed 6 to climb octaves). */
export function scaleNote(root: number, mode: number, index: number): number {
  const intervals = MODE_INTERVALS[clampMode(mode)];
  const oct = Math.floor(index / 7);
  const step = ((index % 7) + 7) % 7;
  return root + 12 * oct + intervals[step];
}

/**
 * A chord's COLOUR: 0 takes the third from the scale (as the mode makes it), 1 forces a major third, 2 a
 * minor third, 3 and 4 swap the third for a second (sus 2) or a fourth (sus 4). A forced colour also gives
 * the chord a perfect fifth, so a major or minor chord is a true major or minor chord even on a scale step
 * whose own fifth is diminished. This is how a chord that the mode does not make (the E major of an E
 * minor key, say) can be had without leaving the degree system. New colours go at the END.
 */
export const COLOR_NAMES = ['From the scale', 'Major', 'Minor', 'Sus 2', 'Sus 4'];
const COLOR_THIRD = [0, 4, 3, 2, 5]; // semitones above the chord root, for colours 1-4

export function clampColor(c: number): number {
  return Math.max(0, Math.min(COLOR_NAMES.length - 1, Math.round(Number.isFinite(c) ? c : 0)));
}

/** Ascending chord tones for a degree (1-7), as absolute notes relative to `root`. */
export function chordStack(root: number, mode: number, degree: number, style: number, color = 0): number[] {
  const d = Math.max(1, Math.min(7, degree)) - 1;
  const st = Math.max(0, Math.min(STYLE_STEPS.length - 1, style));
  const stack = STYLE_STEPS[st].map((s) => scaleNote(root, mode, d + s));
  const c = clampColor(color);
  // Open fifth and fifth only have no third to colour; the sus styles take only a sus colour.
  if (c === 0 || st === 5 || st === 6) return stack;
  if ((st === 1 || st === 2) && c < 3) return stack;
  const rootNote = stack[0];
  const out = stack.slice();
  out[1] = rootNote + COLOR_THIRD[c];
  if (out.length > 2) out[2] = rootNote + 7;
  return out;
}

/** Spoken name, e.g. "D minor", "C major", "B diminished", "G sus 4". */
export function chordLabel(root: number, mode: number, degree: number, style: number, color = 0): string {
  const stack = chordStack(root, mode, degree, style, color);
  const name = pitchClassName(stack[0]);
  const c = clampColor(color);
  if (style === 5) return `${name} open fifth`;
  if (style === 6) return `${name} and ${pitchClassName(stack[1])}`;
  if (style === 1 || (c === 3 && style !== 5 && style !== 6)) return `${name} sus 2`;
  if (style === 2 || (c === 4 && style !== 5 && style !== 6)) return `${name} sus 4`;
  const t = stack[1] - stack[0];
  const f = stack[2] - stack[0];
  let quality: string;
  if (t === 3 && f === 6) quality = 'diminished';
  else if (t === 4 && f === 8) quality = 'augmented';
  else if (t === 4) quality = 'major';
  else quality = 'minor';

  if (style === 4) {
    const s = stack[3] - stack[0];
    if (t === 4 && f === 7) return `${name} ${s === 11 ? 'major 7th' : 'dominant 7th'}`;
    if (t === 3 && f === 7) return `${name} ${s === 11 ? 'minor major 7th' : 'minor 7th'}`;
    if (t === 3 && f === 6) return `${name} ${s === 9 ? 'diminished 7th' : 'half-diminished 7th'}`;
    return `${name} ${quality} 7th`;
  }
  if (style === 3) return `${name} ${quality} add 9`;
  return `${name} ${quality}`;
}

function stackFrom(stack: number[], low: number): number[] {
  const pc = ((stack[0] % 12) + 12) % 12;
  const base = low + ((((pc - low) % 12) + 12) % 12);
  return stack.map((n) => base + (n - stack[0]));
}

function openUp(notes: number[]): number[] {
  if (notes.length < 3) return notes;
  const out = notes.slice();
  out[1] += 12; // lift the second-lowest tone an octave
  return out.sort((a, b) => a - b);
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[0]];
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (rest.length === 0) {
      out.push(cur);
      return;
    }
    rest.forEach((v, i) => rec([...cur, v], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;
}

function nearestInRange(from: number, pc: number, low: number, high: number): number {
  let best = low + ((((pc - low) % 12) + 12) % 12);
  let bestDist = Math.abs(best - from);
  for (let n = best; n <= high; n += 12) {
    const dist = Math.abs(n - from);
    if (dist < bestDist) {
      best = n;
      bestDist = dist;
    }
  }
  return best;
}

/** Re-voice `pcs` to move as little as possible from the previous voicing. */
function leadTo(prev: number[], stack: number[], low: number, high: number): number[] {
  const pcs = stack.map((n) => ((n % 12) + 12) % 12);
  if (prev.length !== pcs.length) return stackFrom(stack, low);
  let best: number[] | null = null;
  let bestCost = Infinity;
  for (const p of permutations(prev.length)) {
    const notes = prev.map((from, i) => nearestInRange(from, pcs[p[i]], low, high));
    if (new Set(notes).size !== notes.length) continue;
    const cost = notes.reduce((sum, n, i) => sum + Math.abs(n - prev[i]), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = notes;
    }
  }
  return (best ?? stackFrom(stack, low)).slice().sort((a, b) => a - b);
}

export type PadChordParams = {
  root: number; // drone root (MIDI)
  mode: number;
  degrees: number[];
  count: number;
  /** Colour of each chord (parallel to degrees; see COLOR_NAMES). Left out = from the scale. */
  colors?: number[];
  style: number;
  register: number; // lowest note of the pad's range
  spread: boolean;
  voiceLead: boolean;
};

/**
 * The loop's chords as ascending MIDI note lists. With voiceLead, each chord
 * after the first moves the fewest semitones from the one before (common tones
 * stay put); without it, every chord is stacked in root position from `register`.
 */
export function buildPadChords(p: PadChordParams): number[][] {
  const count = Math.max(1, Math.min(4, p.count));
  const high = p.register + 19;
  const stacks = p.degrees.slice(0, count).map((d, i) => chordStack(p.root, p.mode, d, p.style, p.colors?.[i] ?? 0));
  const out: number[][] = [];
  stacks.forEach((stack, i) => {
    if (i === 0 || !p.voiceLead) {
      const placed = stackFrom(stack, p.register);
      out.push(p.spread ? openUp(placed) : placed);
    } else {
      out.push(leadTo(out[i - 1], stack, p.register, high));
    }
  });
  return out;
}

export type BassChordParams = {
  root: number; // the key's drone root (MIDI)
  mode: number;
  degrees: number[];
  count: number;
  /** Colour of each chord (parallel to degrees). */
  colors?: number[];
  follow: boolean; // false = stay on the key root; true = the root of each chord
  octave: boolean;
  fifth: boolean;
};

/**
 * Bass note lists, one per chord of the loop (or a single list when not
 * following). Following: each chord's root is folded into [root - 5, root + 6]
 * so the bass stays in the drone's register instead of leaping up a seventh.
 * The fifth follows the chord (a diminished chord gets a diminished fifth);
 * a steady drone always uses a perfect fifth, as it always has.
 */
export function buildBassChords(p: BassChordParams): number[][] {
  const count = Math.max(1, Math.min(4, p.count));
  const degrees = p.follow ? p.degrees.slice(0, count) : [1];
  return degrees.map((d, i) => {
    const stack = chordStack(p.root, p.mode, d, 0, p.follow ? (p.colors?.[i] ?? 0) : 0);
    const folded = p.root + ((((stack[0] - p.root + 5) % 12) + 12) % 12) - 5;
    const base = p.follow ? folded : p.root;
    const notes = [base];
    if (p.octave) notes.push(base + 12);
    if (p.fifth) notes.push(base + (p.follow ? stack[2] - stack[0] : 7));
    return notes;
  });
}
