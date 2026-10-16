// Starter journeys: ready-made journeys Rusty can add and then change. Each is built from the
// plain defaults plus a few overrides, so it stays valid whenever a new setting is added.
import { BedState, Journey, MAX_JOURNEYS, SceneData, applyJourney, captureJourney, captureScene, defaultState } from './config';
import { MAX_CHORDS, MODE_NAMES, chordLabel } from './chords';
import { LaneState, defaultLane } from './looplib';
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
    harmony: { ...b.harmony, mode: spec.mode ?? 5, preset: 0, count, degrees: Array.from({ length: MAX_CHORDS }, (_, k) => spec.degrees[k] ?? 1), colors: Array.from({ length: MAX_CHORDS }, (_, k) => spec.colors?.[k] ?? 0), barsPerChord: spec.barsPerChord },
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
    minorScene({ name: 'B, G#m, C#m, G#m twice, F#', keyOffset: 0, mode: 5, degrees: [3, 1, 4, 1, 3, 1, 4, 1, 7], barsPerChord: 2, follow: true, drums: groove, snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 2)) }),
    // 4: a sister progression G#m, E, B, F#; the pad and bass both go steady together now and then.
    minorScene({ name: 'G#m, E, B, F#', keyOffset: 0, mode: 5, degrees: [1, 6, 3, 7], barsPerChord: 2, follow: true, drums: groove, snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 1), rule(16, 8, 0), rule(16, 8, 0)) }),
  ];
  return { ...captureJourney(defaultState), name: 'Flute G# minor B', root: 44, bpm: 90, activeScene: 0, scenes };
}

function fluteTwoChords(): Journey {
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
    // 3: B and G#m, back and forth, 2 bars each.
    minorScene({ name: 'B, G#m cycle', keyOffset: 0, mode: 5, degrees: [3, 1], barsPerChord: 2, follow: true, drums: groove, snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 2)) }),
    // 4: C#m and G#m, back and forth, 2 bars each; the pad and bass go steady together now and then.
    minorScene({ name: 'C#m, G#m cycle', keyOffset: 0, mode: 5, degrees: [4, 1], barsPerChord: 2, follow: true, drums: groove, snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 1), rule(16, 8, 0), rule(16, 8, 0)) }),
  ];
  return { ...captureJourney(defaultState), name: 'Flute two-chord cycles', root: 44, bpm: 90, activeScene: 0, scenes };
}

type ModalSpec = {
  /** The mode's tonic as a MIDI note, low (the bass drone). */
  tonic: number;
  mode: number; // index into MODE_NAMES
  bpm: number;
  flip: number[]; // scale degrees of the two-chord flip-flop (scene 2)
  turn: number[]; // scale degrees of a second, different progression (scene 3)
  /** Scene 4 plays these chords (following them) instead of one steady tonic chord. */
  home?: number[];
};

const shortChord = (root: number, mode: number, degree: number) =>
  chordLabel(root, mode, degree, 0, 0).replace(' major', '').replace(' minor', 'm').replace(' diminished', ' dim');

/**
 * A journey for a C ocarina played modally: the chords are all notes of C major, with the tonic
 * on D, E, F, G or A. 1 a drone to improvise over, 2 a two-chord flip-flop, 3 a different short
 * progression, 4 home with a fuller kit. Two bars per chord; no MidiDancer (the player is the melody).
 */
function modalJourney(spec: ModalSpec): Journey {
  const motion = (drums: ReturnType<typeof drumsRule>, pad = noRule, bass = noRule) => ({ bass, pad, drums });
  const wander = { everyBars: 4, chance: 60, returnAfter: 3 };
  const soft = {
    Kick: { rhythm: rhythmIndex('Half time'), steps: 16, hits: 1, rotation: 0, velocity: 78, accentEvery: 0, keepFirst: false },
    Shaker: { velocity: 45, probability: 75 },
    'Low tom': { velocity: 66 },
    'Mid tom': { velocity: 58 },
  };
  const e = { keyOffset: 0, mode: spec.mode };
  const name = (degrees: number[]) => degrees.map((d) => shortChord(spec.tonic, spec.mode, d)).join(', ');
  const scenes = [
    // 1: a steady tonic drone (bass and fifths pad) to improvise over; soft hand drums wander in after 8 bars.
    minorScene({ ...e, name: 'Drone', degrees: [1], barsPerChord: 1, follow: false, padStyle: 6, drums: ['Shaker', 'Low tom', 'Mid tom'], snare: false, evolve: wander, drumOverrides: soft, motion: motion(drumsRule(8, 0, 2, 0)) }),
    // 2: a two-chord flip-flop, two bars each.
    minorScene({ ...e, name: name(spec.flip), degrees: spec.flip, barsPerChord: 2, follow: true, drums: ['Kick', 'Shaker', 'Low tom', 'Mid tom'], snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 2)) }),
    // 3: a different short progression; the bass and pad go steady together now and then.
    minorScene({ ...e, name: name(spec.turn), degrees: spec.turn, barsPerChord: 2, follow: true, drums: ['Kick', 'Shaker', 'Low tom', 'Mid tom'], snare: false, drumOverrides: soft, motion: motion(drumsRule(0, 16, 8, 1), rule(16, 8, 0), rule(16, 8, 0)) }),
    // 4: home on the tonic chord with a fuller kit: kick, snare, hats, tambourine, shaker and toms.
    minorScene({ ...e, name: spec.home ? `${name(spec.home)}, full kit` : 'Home, full kit', degrees: spec.home ?? [1], barsPerChord: spec.home ? 2 : 1, follow: !!spec.home, drums: ['Kick', 'Snare', 'Hat', 'Tambourine', 'Shaker', 'Low tom'], snare: true, drumOverrides: { Shaker: { velocity: 50 }, 'Low tom': { velocity: 70 } }, motion: motion(drumsRule(0, 16, 8, 1), rule(16, 8, 0), rule(16, 8, 0)) }),
  ];
  return { ...captureJourney(defaultState), name: `Ocarina ${MODE_NAMES[spec.mode].split(' ')[0]}`, root: spec.tonic, bpm: spec.bpm, activeScene: 0, scenes };
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
    about: '90 BPM for a flute in G# minor / B. Scene 1 G# minor drone, scene 2 B major drone, both with soft wandering hand drums. Scene 3 B, G#m, C#m, G#m played twice and then F#, 9 chords. Scene 4 G#m, E, B, F#. Two bars per chord.',
    build: fluteGsharpB,
  },
  {
    name: 'Flute two-chord cycles',
    about: '90 BPM for a flute in G# minor / B. Scenes 1 and 2 the G# minor and B major drones. Scene 3 B and G#m back and forth. Scene 4 C#m and G#m back and forth. Two bars per chord.',
    build: fluteTwoChords,
  },
  {
    name: 'Ocarina Dorian',
    about: '88 BPM, C ocarina, tonic D (D Dorian, all white notes). Drone, then Dm and G, then Dm C G C, then home with a full kit.',
    build: () => modalJourney({ tonic: 38, mode: 1, bpm: 88, flip: [1, 4], turn: [1, 7, 4, 7] }),
  },
  {
    name: 'Ocarina Mixolydian',
    about: '92 BPM, C ocarina, tonic G (G Mixolydian). Drone, then G and F, then G F C F, then home with a full kit.',
    build: () => modalJourney({ tonic: 43, mode: 4, bpm: 92, flip: [1, 7], turn: [1, 7, 4, 7] }),
  },
  {
    name: 'Ocarina Aeolian',
    about: '80 BPM, C ocarina, tonic A (A minor). Drone, then Am and G, then Am F C G, then home with a full kit.',
    build: () => modalJourney({ tonic: 33, mode: 5, bpm: 80, flip: [1, 7], turn: [1, 6, 3, 7] }),
  },
  {
    name: 'Ocarina Lydian',
    about: '84 BPM, C ocarina, tonic F (F Lydian, dreamy). Drone, then F and G, then F G C G, then home with a full kit.',
    build: () => modalJourney({ tonic: 41, mode: 3, bpm: 84, flip: [1, 2], turn: [1, 2, 5, 2] }),
  },
  {
    name: 'Ocarina Ionian',
    about: '90 BPM, C ocarina, tonic C (C major). Drone, then C and F, then C G Am F, then home with a full kit.',
    build: () => modalJourney({ tonic: 36, mode: 0, bpm: 90, flip: [1, 4], turn: [1, 5, 6, 4] }),
  },
  {
    name: 'Ocarina Phrygian',
    about: '76 BPM, C ocarina, tonic E (E Phrygian, dark and a little Spanish). Drone, then Em and F, then Em F Em D, then Em and C with a full kit; the breathing there drops to a plain E drone with fifths.',
    build: () => modalJourney({ tonic: 40, mode: 2, bpm: 76, flip: [1, 2], turn: [1, 2, 1, 7], home: [1, 6] }),
  },
];

const SHAKERZ_FOLDER = 'SHAKERZ flat FLAC 16 bit';
const TAMBOREENE_FOLDER = 'TAMBOREENE flat FLAC 16 bit';
// The tempos each flattened loop exists at (see the loops folders).
const CAXIXI_TEMPOS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
const MARACAS_8THS_TEMPOS = [80, 90, 100, 110, 120, 130, 140, 150, 160];
const TAMB_2AND4_TEMPOS = [60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];

/** The tempo in the list closest to this one; a tie goes to the higher tempo (the loop then plays a touch slower). */
export function nearestTempo(list: number[], bpm: number): number {
  return list.reduce((best, t) => (Math.abs(t - bpm) < Math.abs(best - bpm) || (Math.abs(t - bpm) === Math.abs(best - bpm) && t > best) ? t : best), list[0]);
}

/**
 * Loop lanes for a journey at this tempo: lane 1 a caxixi pulse (quarter notes), lane 2 maracas in straight
 * eighths, lane 3 a tambourine on 2 and 4. Each scene says which are playing: 1 the caxixi alone over the drone,
 * 2 and 3 maracas and tambourine, 4 all three. The loops are named for the flattened folders in Rusty's Dropbox
 * (SHAKERZ / TAMBOREENE); a lane stays quiet until those loops are imported (`resolveLaneIds` finds them even
 * if the folders are called something else).
 */
export function loopLanesFor(bpm: number, scene: number): LaneState[] {
  const caxixi = `${SHAKERZ_FOLDER}/CAXIXI QUARTERS ${nearestTempo(CAXIXI_TEMPOS, bpm)}bpm.flac`;
  const maracas = `${SHAKERZ_FOLDER}/MARACAS STR 8THS ${nearestTempo(MARACAS_8THS_TEMPOS, bpm)}bpm.flac`;
  const tambourine = `${TAMBOREENE_FOLDER}/TAMBOURINE 2 AND 4 ${nearestTempo(TAMB_2AND4_TEMPOS, bpm)}bpm.flac`;
  const on = [[true, false, false], [false, true, true], [false, true, true], [true, true, true]][Math.max(0, Math.min(3, scene))];
  return [
    { ...defaultLane, loop: caxixi, on: on[0], level: 70, pan: -40 },
    { ...defaultLane, loop: maracas, on: on[1], level: 80, pan: 40 },
    { ...defaultLane, loop: tambourine, on: on[2], level: 70, pan: 0 },
    { ...defaultLane },
  ];
}

/** A journey with the loop lanes added to each of its four scenes. */
export function withLoops(j: Journey): Journey {
  return { ...j, scenes: j.scenes.map((sc, i) => ({ ...sc, lanes: loopLanesFor(j.bpm, i) })) };
}

/** Add a starter journey after the others and make it the active one. Does nothing when the list is full. */
export function addStarterJourney(s: BedState, index: number): BedState {
  const starter = STARTER_JOURNEYS[index];
  if (!starter || s.journeys.length >= MAX_JOURNEYS) return s;
  const saved = s.journeys.map((j, i) => (i === s.activeJourney ? captureJourney(s) : j));
  let journey = withLoops(starter.build());
  if (saved.some((j) => j.name === journey.name)) {
    let n = 2;
    while (saved.some((j) => j.name === `${starter.name} ${n}`)) n++;
    journey = { ...journey, name: `${starter.name} ${n}` };
  }
  return { ...applyJourney(s, journey), journeys: [...saved, journey], activeJourney: saved.length };
}
