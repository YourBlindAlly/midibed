/**
 * Editing a drum's pattern one step at a time. A drum's `custom` text holds one character per step:
 * 'x' a hit, 'g' a ghost (quiet) hit, '.' nothing, 'o' an open hat hit (a hit that rings, for a hat), and '2', '3', '4'
 * a hit played as that many quick hits within the step (a ratchet). Empty means the drum is using a library rhythm or the Euclidean spread.
 * Rotation is applied on top of the text, exactly as for the other patterns.
 */
import { euclidHit } from './euclid';
import { RHYTHMS, clampRhythm } from './rhythms';

export const MAX_EDIT_STEPS = 32;

export type StepState = 0 | 1 | 2 | 3 | 4 | 5 | 6; // off, hit, ghost, double, triple, four, open
export const STEP_STATE_NAMES = ['off', 'hit', 'ghost, a quiet hit', 'double, two quick hits', 'triple, three quick hits', 'four quick hits', 'open hat hit'];
/** The step text character for each state. */
export const STEP_CHARS = ['.', 'x', 'g', '2', '3', '4', 'o'];
/** Characters that count as a hit of the main pattern (a ghost is not one). */
const HIT_CHARS = 'xo234';

type PatternSource = { custom?: string; rhythm: number; hits: number; steps: number };

/** How many steps the drum's pattern has. */
export function patternSteps(d: PatternSource): number {
  if (d.custom) return d.custom.length;
  return d.rhythm > 0 ? RHYTHMS[clampRhythm(d.rhythm)].steps : d.steps;
}

/** The drum's pattern as step text, from the custom text, the library rhythm or the Euclidean spread (before rotation). */
export function patternString(d: PatternSource): string {
  if (d.custom) return d.custom;
  if (d.rhythm > 0) {
    const r = RHYTHMS[clampRhythm(d.rhythm)];
    return Array.from({ length: r.steps }, (_, k) => (r.hits.includes(k) ? 'x' : '.')).join('');
  }
  const steps = Math.max(1, Math.min(MAX_EDIT_STEPS, d.steps));
  const hits = Math.max(0, Math.min(steps, d.hits));
  return Array.from({ length: steps }, (_, k) => (euclidHit(k, hits, steps) ? 'x' : '.')).join('');
}

/** Only keep step text that is usable (2 to 32 characters of x, g, o, 2, 3, 4 and a dot), else ''. */
export function cleanCustom(text: unknown): string {
  if (typeof text !== 'string') return '';
  if (text.length < 2 || text.length > MAX_EDIT_STEPS) return '';
  return /^[xgo234.]+$/.test(text) ? text : '';
}

export function stepStateAt(text: string, index: number): StepState {
  const k = STEP_CHARS.indexOf(text[index] ?? '.');
  return (k < 0 ? 0 : k) as StepState;
}

/** The step text with one step set; starts from the drum's current pattern if it has not been edited yet. */
export function withStep(d: PatternSource, index: number, state: StepState): string {
  const base = patternString(d);
  if (index < 0 || index >= base.length) return base;
  const ch = STEP_CHARS[state] ?? '.';
  return base.slice(0, index) + ch + base.slice(index + 1);
}

/** Does this step character match? 'x' means any hit of the main pattern (a plain hit, an open hit or a ratchet). */
const matches = (c: string, ch: 'x' | 'g') => (ch === 'x' ? HIT_CHARS.includes(c) : c === ch);

/** Bit n set where the text has the given character (2 ** n, so a 32 step pattern is safe). */
export function maskOf(text: string, ch: 'x' | 'g'): number {
  let m = 0;
  for (let k = 0; k < text.length; k++) if (matches(text[k], ch)) m += 2 ** k;
  return m;
}

export function countOf(text: string, ch: 'x' | 'g'): number {
  return [...text].filter((c) => matches(c, ch)).length;
}

/** True when the text uses open hits or ratchets, which the engine needs the step text for. */
export function hasStepExtras(text: string): boolean {
  return /[o234]/.test(text);
}

/** A step as it would be said: "beat 2", "the and of 2", or for other lengths just its number. Index is 0-based. */
export function stepName(index: number, steps: number): string {
  if (steps % 4 !== 0 || steps > 32) return `step ${index + 1} of ${steps}`;
  const inBar = index % 16;
  const beat = Math.floor(inBar / 4) + 1;
  const sub = ['', 'e', 'and', 'a'][inBar % 4];
  const place = sub === '' ? `beat ${beat}` : `the ${sub} of ${beat}`;
  const bar = steps > 16 ? `bar ${Math.floor(index / 16) + 1}, ` : '';
  return `${bar}${place}`;
}

/** The pattern with rotation applied, as step text. */
export function rotatedText(text: string, rotation: number): string {
  const n = text.length;
  if (n === 0) return '';
  let out = '';
  for (let step = 0; step < n; step++) {
    const pos = (((step - rotation) % n) + n) % n;
    out += text[pos];
  }
  return out;
}

/** A short spoken description of the pattern. */
export function describeText(text: string, rotation: number): string {
  const t = rotatedText(text, rotation);
  const part = (ch: string, word: string) => {
    const on = [...t].map((c, k) => (c === ch ? k + 1 : 0)).filter((n) => n > 0);
    return on.length ? `${word} on steps ${on.join(', ')}` : '';
  };
  const bits = [part('x', 'hits'), part('o', 'open hits'), part('2', 'double hits'), part('3', 'triple hits'), part('4', 'four-hit rolls'), part('g', 'ghost hits')].filter(Boolean);
  return bits.length ? `${bits.join('; ')} of ${t.length}` : `silent, ${t.length} steps`;
}

/** Save a drum's hits (ghosts left out) as a rhythm in the player's own list; returns the new list text and the name used. */
export function addUserRhythm(listText: string, text: string, wantedName: string): { list: string; name: string } | null {
  const hits = [...text].map((c, k) => (HIT_CHARS.includes(c) ? k : -1)).filter((k) => k >= 0);
  if (text.length < 1 || hits.length === 0) return null;
  let list: { name: string; steps: number; hits: number[] }[] = [];
  try {
    const parsed = JSON.parse(listText);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = [];
  }
  const base = wantedName.trim().slice(0, 36) || 'My rhythm';
  const taken = (n: string) => RHYTHMS.some((r) => r.name === n) || list.some((r) => r.name === n);
  let name = base;
  for (let k = 2; taken(name); k++) name = `${base} ${k}`;
  list.push({ name, steps: text.length, hits });
  return { list: JSON.stringify(list), name };
}
