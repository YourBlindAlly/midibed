/**
 * A library of real rhythms for the drum patterns. Index 0 is the Euclidean spread (hits, steps, rotation); any
 * other index replaces it with a fixed pattern on its own number of steps. Rotation, ghost notes, accents,
 * chance, looseness and evolving all still apply on top. Choosing hits or steps by hand goes back to Euclidean.
 *
 * The patterns are the standard ones: the six timelines of Toussaint's "The Euclidean Algorithm Generates
 * Traditional Musical Rhythms" on a 16-step grid (shiko, son, soukous, rumba, bossa nova, gahu), the 12/8
 * bembe bell, the common 8-step Afro-Cuban cells, and some plain grooves. A 3-2 clave becomes a 2-3 clave
 * with a rotation of half the steps. New rhythms go at the END so a saved number keeps its meaning.
 * Native: MidiBedDrumConfig.mask/useMask in MidiBedEngine.swift.
 */
export type Rhythm = {
  name: string;
  /** Steps in the cycle (sixteenth notes); 0 for the Euclidean entry. */
  steps: number;
  /** Zero-based steps that play. */
  hits: number[];
};

export const RHYTHMS: Rhythm[] = [
  { name: 'Euclidean spread', steps: 0, hits: [] },
  { name: 'Son clave', steps: 16, hits: [0, 3, 6, 10, 12] },
  { name: 'Rumba clave', steps: 16, hits: [0, 3, 7, 10, 12] },
  { name: 'Bossa nova clave', steps: 16, hits: [0, 3, 6, 10, 13] },
  { name: 'Shiko', steps: 16, hits: [0, 4, 6, 10, 12] },
  { name: 'Soukous', steps: 16, hits: [0, 3, 6, 10, 11] },
  { name: 'Gahu', steps: 16, hits: [0, 3, 6, 10, 14] },
  { name: 'Bembe bell, 12 steps', steps: 12, hits: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Tresillo, 8 steps', steps: 8, hits: [0, 3, 6] },
  { name: 'Cinquillo, 8 steps', steps: 8, hits: [0, 2, 3, 5, 6] },
  { name: 'Habanera, 8 steps', steps: 8, hits: [0, 3, 4, 6] },
  { name: 'Four on the floor', steps: 16, hits: [0, 4, 8, 12] },
  { name: 'Backbeat', steps: 16, hits: [4, 12] },
  { name: 'Half time', steps: 16, hits: [8] },
  { name: 'Offbeat eighths', steps: 16, hits: [2, 6, 10, 14] },
  { name: 'Straight eighths', steps: 16, hits: [0, 2, 4, 6, 8, 10, 12, 14] },
  { name: 'Straight sixteenths', steps: 16, hits: Array.from({ length: 16 }, (_, i) => i) },
  // Beat 1, the 'e' of beat 2 (2.25), beat 3: a syncopated kick.
  { name: 'Syncopated kick: 1, 2 e, 3', steps: 16, hits: [0, 5, 8] },
];

export function clampRhythm(i: number): number {
  return Math.max(0, Math.min(RHYTHMS.length - 1, Math.round(Number.isFinite(i) ? i : 0)));
}

/** The pattern as bits (bit n = step n plays). */
export function rhythmMask(i: number): number {
  const r = RHYTHMS[clampRhythm(i)];
  return r.hits.reduce((m, h) => m | (1 << h), 0);
}

/** The pattern with the rotation applied, as one boolean per step. */
export function rhythmPattern(i: number, rotation: number): boolean[] {
  const r = RHYTHMS[clampRhythm(i)];
  const n = Math.max(1, r.steps);
  const out: boolean[] = [];
  for (let step = 0; step < n; step++) {
    const pos = (((step - rotation) % n) + n) % n;
    out.push(r.hits.includes(pos));
  }
  return out;
}

export function rhythmText(i: number, rotation: number): string {
  return rhythmPattern(i, rotation)
    .map((v) => (v ? 'x' : '.'))
    .join('');
}

export function rhythmDescribe(i: number, rotation: number): string {
  const p = rhythmPattern(i, rotation);
  const on = p.map((v, k) => (v ? k + 1 : 0)).filter((n) => n > 0);
  return on.length === 0 ? `silent, ${p.length} steps` : `hits on steps ${on.join(', ')} of ${p.length}`;
}
