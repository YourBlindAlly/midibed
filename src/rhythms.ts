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
  // A kick on beats 1 and 3: a plain foundation.
  { name: 'Kick on 1 and 3', steps: 16, hits: [0, 8] },
  // Single-drum patterns for the grooves (src/grooves.ts). Designs in the spirit of each style, to be tuned by ear.
  { name: 'Beat 1 only', steps: 16, hits: [0] },
  // Lub on beat one, dub a dotted eighth later.
  { name: 'Heartbeat: lub-dub', steps: 16, hits: [0, 3] },
  // Beat 1 and the 'a' of 2: a laid-back half-time kick.
  { name: 'Downtempo kick: 1, a of 2', steps: 16, hits: [0, 7] },
  { name: 'Trip-hop kick', steps: 16, hits: [0, 6, 11] },
  // Beat 1, the 'a' of 2, the 'and' of 3: the kick leans around the snare on 2 and 4.
  { name: 'Boom bap kick', steps: 16, hits: [0, 7, 10] },
  // Beats 1 and 3 with a ghost kick near the end of the bar.
  { name: 'Lo-fi kick', steps: 16, hits: [0, 8, 14] },
  // The bossa bass drum: dotted quarter, eighth, twice.
  { name: 'Bossa kick', steps: 16, hits: [0, 6, 8, 14] },
  // A snare on 2, the "a" before 3, the "e" after 3 and 4; the second bar adds the "a" of 4 as a pickup into the next downbeat.
  { name: 'Snare 2, a, e, 4 with pickup (2 bars)', steps: 32, hits: [4, 7, 9, 12, 20, 23, 25, 28, 31] },
];

export function clampRhythm(i: number): number {
  return Math.max(0, Math.min(RHYTHMS.length - 1, Math.round(Number.isFinite(i) ? i : 0)));
}

/** The pattern as bits (bit n = step n plays). */
export function rhythmMask(i: number): number {
  const r = RHYTHMS[clampRhythm(i)];
  return r.hits.reduce((m, h) => m + 2 ** h, 0);
}

/** How many rhythms come with the app; the ones after these were loaded from a file and are always appended. */
export const BUILTIN_RHYTHM_COUNT = RHYTHMS.length;

/** A rhythm from a file, or null if it is not usable (name, 1 to 32 steps, hits inside the steps). */
export function checkRhythm(raw: unknown): Rhythm | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
  const steps = Number(r.steps);
  if (!name || !Number.isInteger(steps) || steps < 1 || steps > 32 || !Array.isArray(r.hits)) return null;
  const hits = [...new Set(r.hits.map(Number))].filter((h) => Number.isInteger(h) && h >= 0 && h < steps).sort((a, b) => a - b);
  if (hits.length !== new Set(r.hits.map(Number)).size) return null;
  return { name, steps, hits };
}

/**
 * Add rhythms from a file to the end of the library (a name already there is left as it is, so numbers saved in
 * scenes keep their meaning). Returns the names that were added.
 */
export function registerRhythms(list: unknown): string[] {
  const added: string[] = [];
  if (!Array.isArray(list)) return added;
  for (const raw of list) {
    const r = checkRhythm(raw);
    if (!r || RHYTHMS.some((x) => x.name === r.name)) continue;
    RHYTHMS.push(r);
    added.push(r.name);
  }
  return added;
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
