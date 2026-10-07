/**
 * Modal chord generation for the pad layer. Pure functions only: the native
 * engine just plays the note lists this produces, at bar boundaries.
 * Self-contained (no imports from config.ts, which imports this).
 */

export const MODE_NAMES = ['Ionian (major)', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian (minor)', 'Locrian'];

export const MODE_INTERVALS: number[][] = [
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 9, 10],
  [0, 1, 3, 5, 7, 8, 10],
  [0, 2, 4, 6, 7, 9, 11],
  [0, 2, 4, 5, 7, 9, 10],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 1, 3, 5, 6, 8, 10],
];

export const STYLE_NAMES = ['Triad', 'Sus 2', 'Sus 4', 'Add 9', 'Seventh', 'Open fifth'];

/** Scale-step offsets from the chord's degree for each chord type. */
const STYLE_STEPS: number[][] = [
  [0, 2, 4],
  [0, 1, 4],
  [0, 3, 4],
  [0, 2, 4, 8],
  [0, 2, 4, 6],
  [0, 4, 7],
];

export type ChordPreset = { name: string; degrees: number[] };

/** Index 0 is "Custom": selecting it changes nothing. Degrees are 1-7. */
export const PRESETS: ChordPreset[] = [
  { name: 'Custom', degrees: [] },
  { name: 'Pedal, one chord', degrees: [1] },
  { name: 'Rock between two', degrees: [1, 7] },
  { name: 'Lift', degrees: [1, 4] },
  { name: 'Fall', degrees: [1, 7, 6] },
  { name: 'Folk turn', degrees: [1, 7, 4, 7] },
  { name: 'Descent', degrees: [1, 7, 6, 5] },
  { name: 'Wide arc', degrees: [1, 3, 4, 5] },
];

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchClassName(note: number): string {
  return PC_NAMES[((Math.round(note) % 12) + 12) % 12];
}

/** MIDI note of scale step `index` (0-based, may exceed 6 to climb octaves). */
export function scaleNote(root: number, mode: number, index: number): number {
  const intervals = MODE_INTERVALS[Math.max(0, Math.min(6, mode))];
  const oct = Math.floor(index / 7);
  const step = ((index % 7) + 7) % 7;
  return root + 12 * oct + intervals[step];
}

/** Ascending chord tones for a degree (1-7), as absolute notes relative to `root`. */
export function chordStack(root: number, mode: number, degree: number, style: number): number[] {
  const d = Math.max(1, Math.min(7, degree)) - 1;
  const steps = STYLE_STEPS[Math.max(0, Math.min(STYLE_STEPS.length - 1, style))];
  return steps.map((s) => scaleNote(root, mode, d + s));
}

/** Spoken name, e.g. "D minor", "C major", "B diminished", "G sus 4". */
export function chordLabel(root: number, mode: number, degree: number, style: number): string {
  const stack = chordStack(root, mode, degree, style);
  const name = pitchClassName(stack[0]);
  if (style === 5) return `${name} open fifth`;
  if (style === 1) return `${name} sus 2`;
  if (style === 2) return `${name} sus 4`;
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
  const stacks = p.degrees.slice(0, count).map((d) => chordStack(p.root, p.mode, d, p.style));
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
