// Starter journeys: ready-made journeys Rusty can add and then change. Each is built from the
// plain defaults plus a few overrides, so it stays valid whenever a new setting is added.
import { BedState, Journey, MAX_JOURNEYS, SceneData, applyJourney, captureJourney, captureScene, defaultState } from './config';
import { RHYTHMS } from './rhythms';

const rhythmIndex = (name: string): number => Math.max(0, RHYTHMS.findIndex((r) => r.name === name));

type SceneSpec = {
  name: string;
  degrees: number[];
  /** Per chord: 0 from the scale, 1 major, 2 minor (see COLOR_NAMES). Default all from the scale. */
  colors?: number[];
  /** Semitones above the journey key; default -3 (the relative minor of a major journey key). */
  keyOffset?: number;
  mode?: number;
  /** Pad chord type (STYLE_NAMES); default 0 = triad, 6 = fifth only. */
  padStyle?: number;
  /** Patterns that wander by themselves: change every N bars. Default off. */
  evolve?: { everyBars: number; chance: number; returnAfter: number };
  /** Settings laid over a drum after the standard ones, by drum name. */
  drumOverrides?: Record<string, Record<string, number | boolean>>;
  barsPerChord: number;
  follow: boolean; // bass and pad follow the chords
  drums: string[]; // names of the drums that are on
  snare: boolean;
  motion: Partial<BedState['motion']>;
};

/** Build one scene on top of the defaults. Key A minor is the journey key C moved down 3 semitones. */
function minorScene(spec: SceneSpec): SceneData {
  const b = defaultState;
  const drums = b.drums.map((d) => {
    const on = spec.drums.includes(d.name);
    if (d.name === 'Kick') {
      return { ...d, enabled: on, rhythm: rhythmIndex('Syncopated kick: 1, 2 e, 3'), steps: 16, hits: 3, rotation: 0, velocity: 100, accentEvery: 3, accentOffset: 1, accentBoost: 40, keepFirst: true };
    }
    if (d.name === 'Snare') {
      return { ...d, enabled: on, rhythm: rhythmIndex('Backbeat'), steps: 16, hits: 2, rotation: 0 };
    }
    if (d.name === 'Hat') return { ...d, enabled: on, rhythm: 0, steps: 16, hits: 11, rotation: 0, probability: 90 };
    if (d.name === 'Tambourine') return { ...d, enabled: on, rhythm: 0, steps: 16, hits: 6, rotation: 3, probability: 85 };
    return { ...d, enabled: on };
  }).map((d) => ({ ...d, ...(spec.drumOverrides?.[d.name] ?? {}) }));
  const count = spec.degrees.length;
  return captureScene({
    ...b,
    sceneName: spec.name,
    keyOffset: spec.keyOffset ?? -3,
    drums,
    harmony: { ...b.harmony, mode: spec.mode ?? 5, preset: 0, count, degrees: [...spec.degrees, 1, 1, 1, 1].slice(0, 4), colors: [...(spec.colors ?? []), 0, 0, 0, 0].slice(0, 4), barsPerChord: spec.barsPerChord },
    drone: { ...b.drone, follow: spec.follow },
    pad: { ...b.pad, follow: spec.follow, style: spec.padStyle ?? b.pad.style },
    evolve: spec.evolve ?? b.evolve,
    motion: { ...b.motion, preset: 0, ...spec.motion },
    dancer: { ...b.dancer, enabled: false },
    loops: { ...b.loops, enabled: false },
  });
}

const rule = (baseBars: number, altBars: number, kind = 0) => ({ baseBars, altBars, chance: 100, kind });
const noRule = rule(0, 2);
const drumsRule = (introBars: number, baseBars: number, breakBars: number, style: number) => ({ introBars, baseBars, breakBars, chance: 100, style });

export type StarterJourney = { name: string; about: string; build: () => Journey };

/** "Go with Guitar": 80 BPM, C major's relative minor (A minor). */
function goWithGuitar(): Journey {
  const motion = (drums: ReturnType<typeof drumsRule>, pad = noRule, bass = noRule) => ({ bass, pad, drums });
  const scenes = [
    // 1: bass drone and a steady Am chord; the drums come in after 16 bars.
    minorScene({ name: 'Intro', degrees: [1], barsPerChord: 1, follow: false, drums: ['Kick', 'Hat', 'Tambourine'], snare: false, motion: motion(drumsRule(16, 0, 2, 0)) }),
    // 2: F, G, Am (2 bars); snare on 2 and 4; the drums drop out for a while now and then.
    minorScene({ name: 'F, G, Am', degrees: [6, 7, 1, 1], barsPerChord: 1, follow: true, drums: ['Kick', 'Snare', 'Hat', 'Tambourine'], snare: true, motion: motion(drumsRule(0, 8, 8, 0)) }),
    // 3: Dm, C, G, G; the pad goes to a steady fifths drone and the bass goes steady too, together; the breakdown loses kick and snare.
    minorScene({ name: 'Dm, C, G', degrees: [4, 3, 7, 7], barsPerChord: 1, follow: true, drums: ['Kick', 'Snare', 'Hat', 'Tambourine'], snare: true, motion: motion(drumsRule(0, 8, 8, 1), rule(8, 8, 0), rule(8, 8, 0)) }),
    // 4: home to Am, with drums; the breathing takes all the drums out for a long stretch.
    minorScene({ name: 'Home', degrees: [1], barsPerChord: 1, follow: false, drums: ['Kick', 'Snare', 'Hat', 'Tambourine'], snare: true, motion: motion(drumsRule(0, 8, 64, 0)) }),
  ];
  return {
    ...captureJourney(defaultState),
    name: 'Go with Guitar',
    root: 36, // C2; every scene sits 3 semitones below it, on A
    bpm: 80,
    activeScene: 0,
    scenes,
  };
}

/** "E and C": 85 BPM, E (major) flip-flopping with C major, built as E Aeolian with chord 1 forced major. */
function eAndC(): Journey {
  const motion = (drums: ReturnType<typeof drumsRule>, pad = noRule, bass = noRule) => ({ bass, pad, drums });
  const e = { keyOffset: 0, mode: 5 };
  const all = ['Kick', 'Snare', 'Hat', 'Tambourine'];
  const scenes = [
    // 1: bass drone and a steady E major chord; the drums come in after 16 bars.
    minorScene({ ...e, name: 'Intro', degrees: [1], colors: [1], barsPerChord: 1, follow: false, drums: ['Kick', 'Hat', 'Tambourine'], snare: false, motion: motion(drumsRule(16, 0, 2, 0)) }),
    // 2: E, C, two bars each; snare on 2 and 4; the drums drop out now and then.
    minorScene({ ...e, name: 'E, C', degrees: [1, 6], colors: [1, 0], barsPerChord: 2, follow: true, drums: all, snare: true, motion: motion(drumsRule(0, 8, 8, 0)) }),
    // 3: C, E, C, E one bar each (the flip-flop gets quicker); bass and pad go steady together; the breakdown loses kick and snare.
    minorScene({ ...e, name: 'C, E quick', degrees: [6, 1, 6, 1], colors: [0, 1, 0, 1], barsPerChord: 1, follow: true, drums: all, snare: true, motion: motion(drumsRule(0, 8, 8, 1), rule(8, 8, 0), rule(8, 8, 0)) }),
    // 4: home to a steady E major, with drums; the breathing takes all the drums out for a long stretch.
    minorScene({ ...e, name: 'Home', degrees: [1], colors: [1], barsPerChord: 1, follow: false, drums: all, snare: true, motion: motion(drumsRule(0, 8, 64, 0)) }),
  ];
  return { ...captureJourney(defaultState), name: 'E and C', root: 40, bpm: 85, activeScene: 0, scenes };
}

/**
 * "Flute in G# minor / B": 90 BPM, for a Native American flute in G# minor (its relative major is B).
 * The journey key is G# so the home chord is G#m; the B-major drone scene moves the key up 3 semitones
 * and uses Ionian. In G# Aeolian the degrees are 1 G#m, 3 B, 4 C#m, 6 E, 7 F# (major), so no colours are needed.
 */
function fluteGsharpB(): Journey {
  const motion = (drums: ReturnType<typeof drumsRule>, pad = noRule, bass = noRule) => ({ bass, pad, drums });
  const wander = { everyBars: 4, chance: 60, returnAfter: 3 };
  const soft = {
    Kick: { rhythm: rhythmIndex('Half time'), steps: 16, hits: 1, rotation: 0, velocity: 78, accentEvery: 0, keepFirst: false },
    Shaker: { velocity: 45, probability: 75 },
    'Low tom': { velocity: 66 },
    'Mid tom': { velocity: 58 },
    'High tom': { velocity: 54 },
  };
  const droneKit = ['Shaker', 'Low tom', 'Mid tom'];
  const groove = ['Kick', 'Shaker', 'Low tom', 'Mid tom'];
  const scenes = [
    // 1: a steady G# minor drone (bass and a fifths pad); soft hand drums wander in after 8 bars and keep changing.
    minorScene({ name: 'G# minor drone', keyOffset: 0, mode: 5, degrees: [1], barsPerChord: 1, follow: false, padStyle: 6, drums: droneKit, snare: false, evolve: wander, drumOverrides: soft, motion: motion(drumsRule(8, 0, 2, 0)) }),
    // 2: the same idea on B major (the relative major: 3 semitones up, Ionian).
    minorScene({ name: 'B major drone', keyOffset: 3, mode: 0, degrees: [1], barsPerChord: 1, follow: false, padStyle: 6, drums: [...droneKit, 'High tom'], snare: false, evolve: wander, drumOverrides: soft, motion: motion(drumsRule(8, 0, 2, 0)) }),
    // 3: B, G#m, C#m, F# (major, the turnaround), 2 bars each; the drums drop to the kick now and then.
    minorScene({ name: 'B, G#m, C#m, F#', keyOffset: 0, mode: 5, degrees: [3, 1, 4, 7], barsPerChord: 2, follow: true, drums: groove, snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 2)) }),
    // 4: a sister progression G#m, E, B, F#; the pad and bass both go steady together now and then.
    minorScene({ name: 'G#m, E, B, F#', keyOffset: 0, mode: 5, degrees: [1, 6, 3, 7], barsPerChord: 2, follow: true, drums: groove, snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 1), rule(16, 8, 0), rule(16, 8, 0)) }),
  ];
  return { ...captureJourney(defaultState), name: 'Flute G# minor B', root: 44, bpm: 90, activeScene: 0, scenes };
}

export const STARTER_JOURNEYS: StarterJourney[] = [
  {
    name: 'Go with Guitar',
    about: '80 BPM in A minor. Scene 1 bass drone and one chord, drums after 16 bars. Scene 2 F, G, Am. Scene 3 Dm, C, G, G. Scene 4 home.',
    build: goWithGuitar,
  },
  {
    name: 'E and C',
    about: '85 BPM, E major flip-flopping with C major. Scene 1 bass drone and one E chord, drums after 16 bars. Scene 2 E, C. Scene 3 C, E quicker. Scene 4 home.',
    build: eAndC,
  },
  {
    name: 'Flute G# minor B',
    about: '90 BPM for a flute in G# minor / B. Scene 1 G# minor drone, scene 2 B major drone, both with soft wandering hand drums. Scene 3 B, G#m, C#m, F#. Scene 4 G#m, E, B, F#. Two bars per chord.',
    build: fluteGsharpB,
  },
];

/** Add a starter journey after the others and make it the active one. Does nothing when the list is full. */
export function addStarterJourney(s: BedState, index: number): BedState {
  const starter = STARTER_JOURNEYS[index];
  if (!starter || s.journeys.length >= MAX_JOURNEYS) return s;
  const saved = s.journeys.map((j, i) => (i === s.activeJourney ? captureJourney(s) : j));
  let journey = starter.build();
  if (saved.some((j) => j.name === journey.name)) {
    let n = 2;
    while (saved.some((j) => j.name === `${starter.name} ${n}`)) n++;
    journey = { ...journey, name: `${starter.name} ${n}` };
  }
  return { ...applyJourney(s, journey), journeys: [...saved, journey], activeJourney: saved.length };
}
