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
  /** Name of a rhythm in the library (src/rhythms.ts). */
  rhythm: string;
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

export function grooveIndexById(id: string): number {
  const i = GROOVES.findIndex((g) => g.id === id);
  return i < 0 ? 0 : i;
}

function rhythmIndex(name: string): number {
  const i = RHYTHMS.findIndex((r) => r.name === name);
  return i < 0 ? 0 : i;
}

/** Set the scene's drums and swing to a groove. Sounds, notes and channels are kept. */
export function applyGroove(s: BedState, index: number): BedState {
  const g = GROOVES[Math.max(0, Math.min(GROOVES.length - 1, Math.round(index)))];
  const drums = s.drums.map((d, i) => {
    const spec = g.slots[i];
    if (i >= g.slots.length) return d;
    if (!spec) return { ...d, enabled: false };
    return {
      ...d,
      enabled: true,
      rhythm: rhythmIndex(spec.rhythm),
      rotation: spec.rotation ?? 0,
      velocity: spec.velocity,
      probability: spec.chance ?? 100,
      humanize: spec.humanize ?? 20,
      ghostHits: spec.ghost?.hits ?? 0,
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
