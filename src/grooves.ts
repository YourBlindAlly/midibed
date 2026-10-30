// Grooves: whole-kit drum styles. Choosing one sets the PATTERNS of the scene's drum slots together (which slots are on,
// each one's library rhythm, velocity, chance, ghost notes, accents, looseness) and the swing. It leaves each slot's
// built-in sound, MIDI note and channel alone, and the Euclidean generator and the per-drum 'Drum rhythm' library are
// untouched: changing hits or steps on a drum still goes back to Euclidean for that drum.
//
// The patterns are written for a chill, relaxing, meditation and yoga bed, with some that can be danced to. They are
// designs in the spirit of each style (not copies of any record), meant to be tuned by ear. A slot is addressed by its
// place in the kit (0 Kick, 1 Snare, 2 Hat, 3 Shaker, 4 Tambourine, 5 Low tom, 6 Mid tom, 7 High tom), whatever sound
// or note it has been given. Rhythms are named, so the library can grow without breaking a groove.

import type { BedState, DrumState } from './config';
import { RHYTHMS } from './rhythms';

export type SlotSpec = {
  /** Name of a rhythm in the library (src/rhythms.ts); '' with `euclid` set means the Euclidean spread. */
  rhythm: string;
  /** The Euclidean spread instead of a library rhythm (a groove saved from drums that use hits and steps). */
  euclid?: { hits: number; steps: number };
  velocity: number;
  rotation?: number;
  /** Chance a hit plays, percent (default 100). */
  chance?: number;
  humanize?: number;
  ghost?: { hits: number; rotation?: number; velocity?: number };
  accent?: { every: number; boost?: number; offset?: number };
  looseMs?: number;
  keepFirst?: boolean;
};

export type Groove = {
  id: string;
  name: string;
  /** One plain sentence: the feel, the tempo it likes, what it is good for. */
  about: string;
  swing: number;
  /** Eight slots in kit order; null = that drum is switched off. */
  slots: (SlotSpec | null)[];
};

const K = (rhythm: string, velocity: number, more: Partial<SlotSpec> = {}): SlotSpec => ({ rhythm, velocity, keepFirst: true, humanize: 15, ...more });
const S = (rhythm: string, velocity: number, more: Partial<SlotSpec> = {}): SlotSpec => ({ rhythm, velocity, humanize: 25, ...more });

export const GROOVES: Groove[] = [
  {
    id: 'ambient-pulse',
    name: 'Ambient pulse',
    about: 'Almost nothing: a soft kick once a bar and a faint shaker. For drones and deep rest, any tempo.',
    swing: 0,
    slots: [K('Beat 1 only', 66), null, null, S('Offbeat eighths', 34, { chance: 55, humanize: 40, looseMs: 10 }), null, null, null, null],
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    about: 'A slow lub-dub like a heartbeat, the first beat stronger. For meditation and breathing, 55 to 75 beats per minute.',
    swing: 0,
    slots: [K('Heartbeat: lub-dub', 70, { accent: { every: 2, boost: 40, offset: 0 } }), null, null, null, null, null, null, null],
  },
  {
    id: 'frame-drum',
    name: 'Frame drum pulse',
    about: 'A steady soft pulse on the low drum with the first beat of the bar stronger. Grounding, for yoga and walking meditation, 60 to 90.',
    swing: 0,
    slots: [null, null, null, null, null, S('Four on the floor', 60, { humanize: 30, accent: { every: 4, boost: 35, offset: 0 } }), null, null],
  },
  {
    id: 'half-time-ambient',
    name: 'Half-time ambient',
    about: 'Spacious: a kick on one, a soft rim on three and a whisper of shaker. Chill-out and relaxed flow, 70 to 90.',
    swing: 8,
    slots: [K('Downtempo kick: 1, a of 2', 68), S('Half time', 50, { chance: 90 }), null, S('Offbeat eighths', 34, { chance: 70, humanize: 40 }), null, null, null, null],
  },
  {
    id: 'downtempo',
    name: 'Downtempo',
    about: 'Laid-back and steady: kick, a snare on three, easy hats and a soft shaker. The classic chill bed, 70 to 100.',
    swing: 18,
    slots: [
      K('Downtempo kick: 1, a of 2', 90),
      S('Half time', 76),
      S('Straight eighths', 50, { chance: 90, accent: { every: 2, boost: 22, offset: 1 }, humanize: 40 }),
      S('Straight sixteenths', 32, { chance: 65, humanize: 45 }),
      null,
      null,
      null,
      null,
    ],
  },
  {
    id: 'trip-hop',
    name: 'Trip-hop',
    about: 'Slow, heavy and a little behind the beat: a deep kick, a snare on three, sparse hats. Moody and cinematic, 65 to 90.',
    swing: 22,
    slots: [
      K('Trip-hop kick', 96, { looseMs: 10 }),
      S('Half time', 84, { humanize: 30, looseMs: 14 }),
      S('Offbeat eighths', 48, { chance: 85, looseMs: 12 }),
      null,
      null,
      null,
      null,
      null,
    ],
  },
  {
    id: 'boom-bap',
    name: 'Boom bap',
    about: 'Hip-hop with a knock: the snare on two and four, the kick leaning around it. Head-nodding, 85 to 95.',
    swing: 28,
    slots: [
      K('Boom bap kick', 98),
      S('Backbeat', 92, { humanize: 30 }),
      S('Straight eighths', 58, { humanize: 40, accent: { every: 2, boost: 25, offset: 0 } }),
      null,
      null,
      null,
      null,
      null,
    ],
  },
  {
    id: 'lofi',
    name: 'Lo-fi hip-hop',
    about: 'Dusty and loose: a soft kick with a ghost near the end, a gentle backbeat, swung hats. Study and rest, 70 to 90.',
    swing: 36,
    slots: [
      K('Lo-fi kick', 82),
      S('Backbeat', 68, { humanize: 45 }),
      S('Straight eighths', 46, { humanize: 50, looseMs: 14 }),
      S('Offbeat eighths', 28, { chance: 60, humanize: 45 }),
      null,
      null,
      null,
      null,
    ],
  },
  {
    id: 'chill-house',
    name: 'Chill house',
    about: 'Gentle and danceable: a soft four on the floor, a light clap on two and four, offbeat hats. Sunset and flow yoga, 100 to 118.',
    swing: 6,
    slots: [
      K('Four on the floor', 86),
      S('Backbeat', 66),
      S('Offbeat eighths', 62),
      S('Straight sixteenths', 34, { chance: 70, humanize: 40, accent: { every: 4, boost: 40, offset: 2 } }),
      null,
      null,
      null,
      null,
    ],
  },
  {
    id: 'dub-steppers',
    name: 'Dub steppers',
    about: 'Dubby and deep: the kick on every beat, a rim on three, offbeat hats. Hypnotic, 75 to 100.',
    swing: 8,
    slots: [K('Four on the floor', 92), S('Half time', 78), S('Offbeat eighths', 56), null, null, null, null, null],
  },
  {
    id: 'one-drop',
    name: 'Reggae one-drop',
    about: 'The reggae lilt: the kick and rim fall together on beat three, with skanking hats. Warm and relaxed, 65 to 90.',
    swing: 14,
    slots: [
      K('Half time', 90),
      S('Half time', 78),
      S('Straight eighths', 48, { accent: { every: 2, boost: 35, offset: 1 }, humanize: 35 }),
      null,
      S('Offbeat eighths', 44, { chance: 85, humanize: 40 }),
      null,
      null,
      null,
    ],
  },
  {
    id: 'bossa-lounge',
    name: 'Bossa lounge',
    about: 'Smooth and breezy: the bossa kick, a side-stick clave, soft eighth hats. Cafe and lounge, 80 to 110.',
    swing: 0,
    slots: [
      K('Bossa kick', 74),
      S('Bossa nova clave', 62),
      S('Straight eighths', 42, { humanize: 35 }),
      S('Straight sixteenths', 26, { chance: 55, humanize: 45 }),
      null,
      null,
      null,
      null,
    ],
  },
  {
    id: 'afro-cuban-light',
    name: 'Afro-Cuban light',
    about: 'Warm world percussion: a clave on the rim, hand drums in interlocking cells, an easy kick. Danceable but soft, 85 to 110.',
    swing: 4,
    slots: [
      K('Kick on 1 and 3', 82),
      S('Son clave', 58),
      S('Straight eighths', 44, { chance: 85, humanize: 35 }),
      S('Soukous', 42, { humanize: 40 }),
      null,
      S('Tresillo, 8 steps', 66, { humanize: 35 }),
      null,
      S('Cinquillo, 8 steps', 56, { chance: 85, humanize: 35 }),
    ],
  },
  {
    id: 'folk-boom-chick',
    name: 'Folk boom-chick',
    about: 'Acoustic and easy: kick on one and three, a soft rim on two and four, a swishing shaker. Campfire folk, 80 to 110.',
    swing: 8,
    slots: [
      K('Kick on 1 and 3', 84),
      S('Backbeat', 60),
      null,
      S('Straight eighths', 46, { accent: { every: 2, boost: 30, offset: 1 }, humanize: 35 }),
      S('Offbeat eighths', 48, { chance: 75, humanize: 40 }),
      null,
      null,
      null,
    ],
  },
  {
    id: 'organic-world',
    name: 'Organic world',
    about: 'The folktronica feel: a syncopated kick, hand drums and shakers in loose interlocking patterns. Flowing, 80 to 105.',
    swing: 12,
    slots: [
      K('Syncopated kick: 1, 2 e, 3', 80),
      null,
      null,
      S('Straight sixteenths', 32, { chance: 70, humanize: 45, accent: { every: 4, boost: 40, offset: 0 } }),
      S('Gahu', 52, { chance: 80, humanize: 40 }),
      S('Habanera, 8 steps', 64, { humanize: 35 }),
      S('Soukous', 56, { humanize: 35 }),
      S('Bossa nova clave', 50, { chance: 70, humanize: 35 }),
    ],
  },
];

/** Grooves the player saved or loaded from a file (a module registry like the custom apps; set on every render). */
let userGrooveList: Groove[] = [];

/** The saved text for grooves: a JSON list. Anything unusable is dropped. */
export function parseUserGrooves(text: string): Groove[] {
  try {
    const raw = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    return raw.map((g) => checkGroove(g).groove).filter((g): g is Groove => g !== null);
  } catch {
    return [];
  }
}

export function setUserGrooves(list: Groove[]): void {
  userGrooveList = list;
}

/** Built-in grooves first (a saved groove with the same name takes its place), then the rest of the saved ones. */
export function allGrooves(): Groove[] {
  const byName = new Map(userGrooveList.map((g) => [g.name, g]));
  const base = GROOVES.map((g) => byName.get(g.name) ?? g);
  const extra = userGrooveList.filter((g) => !GROOVES.some((b) => b.name === g.name));
  return [...base, ...extra];
}

export function grooveIndexById(id: string): number {
  const i = allGrooves().findIndex((g) => g.id === id);
  return i < 0 ? 0 : i;
}

/** True for a groove the player saved or loaded (not one that only comes with the app). */
export function isUserGroove(g: Groove): boolean {
  return userGrooveList.some((u) => u.name === g.name);
}

function rhythmIndex(name: string): number {
  const i = RHYTHMS.findIndex((r) => r.name === name);
  return i < 0 ? 0 : i;
}

/** The levels of 'keep the extras sparse', for the screen. */
export const THIN_NAMES = ['As written', 'A little sparser', 'Sparser', 'Very sparse', 'Kick and snare only'];
// Kit places left out at each level (0 kick, 1 snare, 2 hat, 3 shaker, 4 tambourine, 5 low tom, 6 mid tom, 7 high tom):
// level 2 drops the high and mid toms, level 3 all the toms and the tambourine, level 4 everything but the kick and snare.
const THIN_DROP: number[][] = [[], [], [7, 6], [7, 6, 5, 4], [2, 3, 4, 5, 6, 7]];
const THIN_CHANCE = [1, 0.8, 0.6, 0.45, 0];
const THIN_VELOCITY = [1, 0.92, 0.85, 0.8, 1];

/**
 * Set the scene's drums and swing to a groove. Sounds, notes and channels are kept. `thin` (0 to 4) thins the extras
 * (everything but the kick and snare): fewer of their hits play, no ghost notes, a bit softer, and from level 2 the
 * toms (then the tambourine) are left out; level 4 keeps only the kick and snare.
 */
export function applyGroove(s: BedState, index: number, thin = 0): BedState {
  const list = allGrooves();
  const g = list[Math.max(0, Math.min(list.length - 1, Math.round(index)))];
  const level = Math.max(0, Math.min(4, Math.round(thin)));
  const drums = s.drums.map((d, i) => {
    const spec = g.slots[i];
    if (i >= g.slots.length) return d;
    if (!spec || THIN_DROP[level].includes(i)) return { ...d, enabled: false };
    const extra = i >= 2;
    const euclid = spec.euclid && !RHYTHMS.some((r) => r.name === spec.rhythm) ? spec.euclid : null;
    const chance = Math.round((spec.chance ?? 100) * (extra ? THIN_CHANCE[level] : 1));
    return {
      ...d,
      enabled: true,
      rhythm: euclid ? 0 : rhythmIndex(spec.rhythm),
      ...(euclid ? { hits: Math.min(euclid.hits, euclid.steps), steps: euclid.steps } : {}),
      rotation: spec.rotation ?? 0,
      velocity: Math.max(1, Math.round(spec.velocity * (extra ? THIN_VELOCITY[level] : 1))),
      probability: Math.max(1, chance),
      humanize: spec.humanize ?? 20,
      ghostHits: extra && level > 0 ? 0 : spec.ghost?.hits ?? 0,
      ghostRotation: spec.ghost?.rotation ?? 0,
      ghostVelocity: spec.ghost?.velocity ?? 40,
      accentEvery: spec.accent?.every ?? 0,
      accentBoost: spec.accent?.boost ?? 30,
      accentOffset: spec.accent?.offset ?? 0,
      keepFirst: spec.keepFirst ?? false,
      looseMs: spec.looseMs ?? 0,
    };
  });
  return { ...s, drums, swing: g.swing };
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
};

/** One slot from a file: null for an off drum, a cleaned spec, or undefined if it cannot be used. */
function checkSlot(raw: unknown, problems: string[], label: string): SlotSpec | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const rhythm = typeof r.rhythm === 'string' ? r.rhythm : '';
  let euclid: SlotSpec['euclid'];
  if (r.euclid && typeof r.euclid === 'object') {
    const e = r.euclid as Record<string, unknown>;
    const steps = num(e.steps, 1, 32, 16);
    euclid = { hits: num(e.hits, 0, steps, 0), steps };
  }
  if (!euclid && !RHYTHMS.some((x) => x.name === rhythm)) {
    problems.push(`${label}: there is no rhythm called "${rhythm}"`);
    return undefined;
  }
  const spec: SlotSpec = { rhythm, velocity: num(r.velocity, 1, 127, 80) };
  if (euclid) spec.euclid = euclid;
  if (r.rotation !== undefined) spec.rotation = num(r.rotation, 0, 31, 0);
  if (r.chance !== undefined) spec.chance = num(r.chance, 1, 100, 100);
  if (r.humanize !== undefined) spec.humanize = num(r.humanize, 0, 100, 20);
  if (r.looseMs !== undefined) spec.looseMs = num(r.looseMs, 0, 40, 0);
  if (r.keepFirst !== undefined) spec.keepFirst = r.keepFirst === true;
  if (r.ghost && typeof r.ghost === 'object') {
    const gh = r.ghost as Record<string, unknown>;
    spec.ghost = { hits: num(gh.hits, 0, 32, 0), rotation: num(gh.rotation, 0, 31, 0), velocity: num(gh.velocity, 1, 127, 40) };
  }
  if (r.accent && typeof r.accent === 'object') {
    const ac = r.accent as Record<string, unknown>;
    spec.accent = { every: num(ac.every, 0, 8, 0), boost: num(ac.boost, 0, 100, 30), offset: num(ac.offset, 0, 7, 0) };
  }
  return spec;
}

/** A groove from a file or a saved list, or why not. Missing drums at the end count as off. */
export function checkGroove(raw: unknown): { groove: Groove | null; problems: string[] } {
  const problems: string[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { groove: null, problems: ['a groove that is not an object'] };
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
  if (!name) return { groove: null, problems: ['a groove without a name'] };
  if (!Array.isArray(r.slots)) return { groove: null, problems: [`${name}: no drums listed`] };
  const slots: (SlotSpec | null)[] = [];
  for (let i = 0; i < 8; i++) {
    const c = i < r.slots.length ? checkSlot(r.slots[i], problems, `${name}, drum ${i + 1}`) : null;
    if (c === undefined) return { groove: null, problems: problems.length ? problems : [`${name}: drum ${i + 1} is not usable`] };
    slots.push(c);
  }
  if (!slots.some((x) => x !== null)) return { groove: null, problems: [`${name}: every drum is off`] };
  const about = typeof r.about === 'string' && r.about.trim() ? r.about.trim().slice(0, 300) : 'A groove you saved or loaded.';
  const id = typeof r.id === 'string' && r.id ? r.id : `mine-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return { groove: { id, name, about, swing: num(r.swing, 0, 60, 0), slots }, problems };
}

/** Save the scene's drums as a groove: each drum's pattern as it is now, and the swing. */
export function captureGroove(s: BedState, name: string): Groove {
  const slots = s.drums.slice(0, 8).map((d): SlotSpec | null => {
    if (!d.enabled) return null;
    const spec: SlotSpec =
      d.rhythm > 0 && RHYTHMS[d.rhythm]
        ? { rhythm: RHYTHMS[d.rhythm].name, velocity: d.velocity }
        : { rhythm: '', euclid: { hits: d.hits, steps: d.steps }, velocity: d.velocity };
    if (d.rotation) spec.rotation = d.rotation;
    if (d.probability < 100) spec.chance = d.probability;
    spec.humanize = d.humanize;
    if (d.ghostHits > 0) spec.ghost = { hits: d.ghostHits, rotation: d.ghostRotation, velocity: d.ghostVelocity };
    if (d.accentEvery > 0) spec.accent = { every: d.accentEvery, boost: d.accentBoost, offset: d.accentOffset };
    if (d.keepFirst) spec.keepFirst = true;
    if (d.looseMs > 0) spec.looseMs = d.looseMs;
    return spec;
  });
  while (slots.length < 8) slots.push(null);
  const clean = name.trim().slice(0, 40) || 'My groove';
  return { id: `mine-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: clean, about: 'A groove you saved from your own drums.', swing: s.swing, slots };
}

const PATTERN_FIELDS = [
  'enabled',
  'steps',
  'hits',
  'rotation',
  'velocity',
  'probability',
  'humanize',
  'rhythm',
  'ghostHits',
  'ghostRotation',
  'ghostVelocity',
  'accentEvery',
  'accentBoost',
  'accentOffset',
  'keepFirst',
  'looseMs',
] as const;

export type GrooveMemory = { swing: number; drums: Partial<DrumState>[] };

/** Remember every drum's pattern settings and the swing, to undo a groove. */
export function rememberGroove(s: BedState): GrooveMemory {
  return {
    swing: s.swing,
    drums: s.drums.map((d) => {
      const m: Record<string, unknown> = {};
      for (const f of PATTERN_FIELDS) m[f] = d[f];
      return m as Partial<DrumState>;
    }),
  };
}

export function restoreGroove(s: BedState, memory: GrooveMemory): BedState {
  return { ...s, swing: memory.swing, drums: s.drums.map((d, i) => (memory.drums[i] ? { ...d, ...memory.drums[i] } : d)) };
}
