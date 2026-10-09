import { buildBassChords, buildPadChords, clampMode } from './chords';
import { AdvanceRule, advanceBars, defaultAdvance, pickTarget } from './advance';
import { DancerState, defaultDancer, makePhrases } from './dancer';
import { cycleBarsFromOldSpeed, phaseOffset, smoothBeatsFromOldSmooth } from './wander';
import { MotionState, defaultMotion, drumRole } from './motion';
import {
  NOISE_VERSION,
  RecurringState,
  TransitionUse,
  TransitionsState,
  defaultRecurring,
  defaultTransitionUse,
  defaultTransitions,
  shapeMask,
} from './transitions';
import { GM_DRUMS } from './gm';
import { ProfileChoice, defaultProfileChoice } from './profiles';

export type DrumState = {
  name: string;
  enabled: boolean;
  note: number;
  channel: number; // 0-based MIDI channel (9 = GM drums, shown as 10)
  steps: number;
  hits: number;
  rotation: number;
  velocity: number;
  probability: number; // percent 0-100
  humanize: number; // percent 0-100
};

export type DroneState = {
  enabled: boolean;
  channel: number;
  root: number; // MIDI note
  fifth: boolean;
  octave: boolean;
  velocity: number;
  retriggerBars: number;
  /** Play the root of each chord of the harmony loop instead of staying on the key root. */
  follow: boolean;
};

export type WandererState = {
  name: string;
  enabled: boolean;
  cc: number;
  channel: number;
  min: number;
  max: number;
  /** Bars for one full cycle; also how fast free wandering can cross the whole range. */
  cycleBars: number;
  /** Percent: 0 is a clean musical cycle, 100 is free wandering, in between is a blend. */
  looseness: number;
  /** 0-3: starts at the bottom, a quarter, half or three quarters of a cycle later. */
  phase: number;
  /** Beats of easing. */
  smoothBeats: number;
  /** -1 for none, or the index of another filter this one moves AGAINST. */
  opposes: number;
  /** Percent of the opposite movement mixed in. */
  opposeAmount: number;
};

/** One MIDI channel's sound choice, switched with Bank Select + Program Change. */
export type SoundSlot = {
  name: string;
  channel: number; // 0-based
  program: number; // 0-127, shown exactly as sent (Synth One's own screen uses the same numbers)
  sendBank: boolean;
  bankMSB: number; // CC 0
  bankLSB: number; // CC 32
  favorites: string; // comma-separated program numbers, e.g. "12,16,20"
};

/** Valid, de-duplicated, sorted program numbers from a favorites string. */
export function parseFavorites(text: string): number[] {
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const n = Number(part.trim());
    if (part.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 127) out.add(n);
  }
  return [...out].sort((a, b) => a - b).slice(0, 32);
}

export function addFavorite(text: string, program: number): string {
  return parseFavorites(`${text},${program}`).join(',');
}

export function removeFavorite(text: string, program: number): string {
  return parseFavorites(text)
    .filter((p) => p !== program)
    .join(',');
}

/**
 * The chord loop the pad and the bass can follow (see src/chords.ts). It runs
 * whether or not anything is following it. Chords are built on the drone root.
 */
export type HarmonyState = {
  mode: number; // index into MODE_NAMES
  preset: number; // index into PRESETS (0 = custom)
  count: number; // chords in the loop, 1-4
  degrees: number[]; // 4 slots, scale degree 1-7 each; first `count` are used
  barsPerChord: number;
};

/** The sustained chord (or fifths) pad: how it sounds. What it plays comes from the harmony. */
export type PadState = {
  enabled: boolean;
  channel: number;
  velocity: number;
  humanize: number; // percent
  /** true = follows the chord loop; false = one steady chord on the key (a fifths drone with the 'Fifth only' type). */
  follow: boolean;
  style: number; // index into STYLE_NAMES
  register: number; // lowest MIDI note of the pad's range
  spread: boolean;
  voiceLead: boolean;
  strumMs: number;
};

/**
 * Fade times in tenths of a second (0 = no fade). Drone and pad fade by sending
 * a volume-type CC on their channel (`cc` 0 turns that off); drums fade by
 * scaling note velocity.
 */
export type FadeState = {
  cc: number;
  droneIn: number;
  droneOut: number;
  padIn: number;
  padOut: number;
  drumIn: number;
  drumOut: number;
};

/**
 * A loop-playing app (e.g. DrumJam's loops): no notes, just choose a loop, start
 * it and stop it. Which loop and whether it plays belong to the scene; the
 * channel and start/stop controls are routing and stay global.
 */
export type LoopsState = {
  enabled: boolean;
  channel: number;
  program: number; // 0-127, as sent
  sendBank: boolean;
  bankMSB: number;
  bankLSB: number;
  startCC: number; // 0 = none
  stopCC: number; // 0 = same as start (a play toggle)
  favorites: string; // comma-separated program numbers
};

export type BedState = {
  /** MidiDancer: call-and-response phrases on the key's scale. Everything but the channel is saved per scene. */
  dancer: DancerState;
  bpm: number;
  swing: number; // percent 0-100
  midiOut: boolean;
  synthOut: boolean;
  /** Send MIDI clock plus Start/Stop while playing, so other apps can follow the tempo. */
  clock: boolean;
  /** With the clock: also send MIDI Start at the beginning and Stop at the end. Off = clock pulses only. */
  clockTransport: boolean;
  /** With the clock: beats of clock alone before anything else starts, so a follower can lock to the tempo. */
  clockLeadIn: number;
  /** Master switch for all drums at once; each drum keeps its own on/off. Saved per scene. */
  percussion: boolean;
  drums: DrumState[];
  drone: DroneState;
  wanderers: WandererState[];
  loops: LoopsState;
  harmony: HarmonyState;
  /** Per-scene rules that flip layers between two states every so many bars (see motion.ts). */
  motion: MotionState;
  /** Speak a short message when a rule changes something. Off by default. */
  announce: boolean;
  /** The transition sounds (how a scene starts, how the drums break down and return). Global. */
  transitions: TransitionsState;
  /** The recurring sound (every N bars or at the end of each chord loop). Global. */
  recurring: RecurringState;
  /** What this scene does after a while: stay, or move on to another scene by itself (see advance.ts). */
  advance: AdvanceRule;
  /** Freeze: stop the bed changing by itself (breathing, recurring sounds, auto-advance). Never saved as on. */
  frozen: boolean;
  /** Per scene: which of those sounds this scene plays. */
  transitionUse: TransitionUse;
  /** Level-scale version of the saved transition levels (see NOISE_VERSION). */
  noiseVersion: number;
  /** A lead-in needs at least this many eighth notes before the change, or only its downer plays on the beat. */
  transitionMinEighths: number;
  pad: PadState;
  fade: FadeState;
  sounds: SoundSlot[];
  /** Which known app each role talks to (names and shortcuts only; see profiles.ts). */
  profiles: ProfileChoice;
  activeScene: number;
  scenes: SceneData[];
  /** Semitones the current scene's home note sits above the journey key (-6 to 5). Saved per scene. */
  keyOffset: number;
  /** Journeys: the live settings ARE the active one (like scenes). See Journey below. */
  journeyName: string;
  journeys: Journey[];
  activeJourney: number;
};

/** The sound choices a journey remembers for each sound slot (not the routing). */
export type JourneySound = Pick<SoundSlot, 'program' | 'sendBank' | 'bankMSB' | 'bankLSB'>;

/**
 * A journey: a named set of scenes with its own key and tempo (for example "Native flute,
 * G# minor") and the sound choices for each slot. Everything else (routing, profiles,
 * outputs, fades, transition sounds) is global.
 */
export type Journey = {
  name: string;
  root: number;
  bpm: number;
  activeScene: number;
  scenes: SceneData[];
  sounds: JourneySound[];
};

export const MAX_JOURNEYS = 12;

/**
 * What a scene remembers. Deliberately NOT in a scene: tempo, the drone root,
 * outputs, fades, program sounds, and all routing (MIDI channels, CC numbers,
 * drum note numbers), so switching scenes never changes the key, speed or wiring.
 */
export type SceneData = {
  dancer: Omit<DancerState, 'channel'>;
  /** Semitones above the journey key; the scene's home note (see keyRoot). */
  keyOffset: number;
  swing: number;
  percussion: boolean;
  drone: Pick<DroneState, 'enabled' | 'octave' | 'fifth' | 'velocity' | 'retriggerBars' | 'follow'>;
  harmony: HarmonyState;
  motion: MotionState;
  advance: AdvanceRule;
  transitionUse: TransitionUse;
  pad: Omit<PadState, 'channel'>;
  drums: Omit<DrumState, 'name' | 'note' | 'channel'>[];
  wanderers: Pick<WandererState, 'enabled' | 'min' | 'max' | 'cycleBars' | 'looseness' | 'phase' | 'smoothBeats' | 'opposes' | 'opposeAmount'>[];
  loops: Pick<LoopsState, 'enabled' | 'program' | 'sendBank' | 'bankMSB' | 'bankLSB'>;
};

export const SCENE_COUNT = 4;

type SceneSource = Pick<BedState, 'dancer' | 'keyOffset' | 'swing' | 'percussion' | 'drone' | 'harmony' | 'motion' | 'advance' | 'transitionUse' | 'pad' | 'drums' | 'wanderers' | 'loops'>;

export function captureScene(s: SceneSource): SceneData {
  const { channel: _padChannel, ...pad } = s.pad;
  const { channel: _dancerChannel, ...dancer } = s.dancer;
  return {
    dancer: { ...dancer },
    keyOffset: s.keyOffset,
    swing: s.swing,
    percussion: s.percussion,
    drone: {
      enabled: s.drone.enabled,
      octave: s.drone.octave,
      fifth: s.drone.fifth,
      velocity: s.drone.velocity,
      retriggerBars: s.drone.retriggerBars,
      follow: s.drone.follow,
    },
    harmony: { ...s.harmony, degrees: [...s.harmony.degrees] },
    motion: { preset: s.motion.preset, bass: { ...s.motion.bass }, pad: { ...s.motion.pad }, drums: { ...s.motion.drums } },
    advance: { ...s.advance },
    transitionUse: { ...s.transitionUse },
    pad: { ...pad },
    drums: s.drums.map((d) => ({
      enabled: d.enabled,
      steps: d.steps,
      hits: d.hits,
      rotation: d.rotation,
      velocity: d.velocity,
      probability: d.probability,
      humanize: d.humanize,
    })),
    wanderers: s.wanderers.map((w) => ({
      enabled: w.enabled,
      min: w.min,
      max: w.max,
      cycleBars: w.cycleBars,
      looseness: w.looseness,
      phase: w.phase,
      smoothBeats: w.smoothBeats,
      opposes: w.opposes,
      opposeAmount: w.opposeAmount,
    })),
    loops: {
      enabled: s.loops.enabled,
      program: s.loops.program,
      sendBank: s.loops.sendBank,
      bankMSB: s.loops.bankMSB,
      bankLSB: s.loops.bankLSB,
    },
  };
}

/** Overlay a scene onto the live settings, leaving everything global untouched. */
export function applyScene(s: BedState, sc: SceneData): BedState {
  return {
    ...s,
    dancer: { ...s.dancer, ...sc.dancer },
    keyOffset: sc.keyOffset,
    swing: sc.swing,
    percussion: sc.percussion,
    drone: { ...s.drone, ...sc.drone },
    harmony: { ...sc.harmony, degrees: [...sc.harmony.degrees] },
    motion: { preset: sc.motion.preset, bass: { ...sc.motion.bass }, pad: { ...sc.motion.pad }, drums: { ...sc.motion.drums } },
    advance: { ...sc.advance },
    transitionUse: { ...sc.transitionUse },
    pad: { ...s.pad, ...sc.pad },
    drums: s.drums.map((d, i) => ({ ...d, ...sc.drums[i] })),
    wanderers: s.wanderers.map((w, i) => ({ ...w, ...sc.wanderers[i] })),
    loops: { ...s.loops, ...sc.loops },
  };
}

/** Save the live settings into the current scene, then load scene `to`. */
export function switchScene(s: BedState, to: number): BedState {
  if (to < 0 || to >= s.scenes.length || to === s.activeScene) return s;
  const saved = s.scenes.map((sc, i) => (i === s.activeScene ? captureScene(s) : sc));
  return { ...applyScene(s, saved[to]), scenes: saved, activeScene: to };
}

/** Copy the current scene (including unsaved edits) over scene `to`. */
export function copyScene(s: BedState, to: number): BedState {
  if (to < 0 || to >= s.scenes.length || to === s.activeScene) return s;
  const current = captureScene(s);
  return { ...s, scenes: s.scenes.map((sc, i) => (i === s.activeScene || i === to ? current : sc)) };
}

/** Keep a key offset in -6..5 (the nearest way round the octave). */
export function wrapOffset(o: number): number {
  return ((((Math.round(o) + 6) % 12) + 12) % 12) - 6;
}

/** The home note the harmony and bass are built on: the journey key moved by this scene's offset. */
export function keyRoot(s: Pick<BedState, 'drone' | 'keyOffset'>): number {
  return s.drone.root + s.keyOffset;
}

/**
 * Move to the relative key and keep the same chords sounding: minor (Aeolian) to its relative major
 * (Ionian, 3 semitones up) or back. The home note changes, the seven notes do not. Chord numbers
 * are renumbered so the same chords keep playing. Any other mode is returned unchanged.
 */
export function relativeKey(s: BedState): BedState {
  const mode = s.harmony.mode;
  if (mode !== 5 && mode !== 0) return s;
  const toMajor = mode === 5;
  const renumber = (d: number) => (toMajor ? ((((d - 3) % 7) + 7) % 7) + 1 : ((d + 1) % 7) + 1);
  return {
    ...s,
    keyOffset: wrapOffset(s.keyOffset + (toMajor ? 3 : -3)),
    harmony: { ...s.harmony, mode: toMajor ? 0 : 5, preset: 0, degrees: s.harmony.degrees.map(renumber) },
  };
}

/** The current live settings as a journey record. */
export function captureJourney(s: BedState): Journey {
  return {
    name: s.journeyName,
    root: s.drone.root,
    bpm: s.bpm,
    activeScene: s.activeScene,
    scenes: s.scenes.map((sc, i) => (i === s.activeScene ? captureScene(s) : sc)),
    sounds: s.sounds.map((sl) => ({ program: sl.program, sendBank: sl.sendBank, bankMSB: sl.bankMSB, bankLSB: sl.bankLSB })),
  };
}

/** Load a journey record into the live settings (its active scene too). */
export function applyJourney(s: BedState, j: Journey): BedState {
  const withJourney: BedState = {
    ...s,
    journeyName: j.name,
    bpm: j.bpm,
    drone: { ...s.drone, root: j.root },
    scenes: j.scenes,
    activeScene: j.activeScene,
    sounds: s.sounds.map((sl, i) => ({ ...sl, ...j.sounds[i] })),
  };
  return applyScene(withJourney, j.scenes[j.activeScene]);
}

/** Save the live settings into the current journey, then load journey `to`. */
export function switchJourney(s: BedState, to: number): BedState {
  if (to < 0 || to >= s.journeys.length || to === s.activeJourney) return s;
  const saved = s.journeys.map((j, i) => (i === s.activeJourney ? captureJourney(s) : j));
  return { ...applyJourney(s, saved[to]), journeys: saved, activeJourney: to };
}

/** A new journey with the starting scenes, in the same key and tempo as this one, which becomes the active journey. */
export function newJourney(s: BedState): BedState {
  if (s.journeys.length >= MAX_JOURNEYS) return s;
  const saved = s.journeys.map((j, i) => (i === s.activeJourney ? captureJourney(s) : j));
  const fresh: Journey = {
    ...captureJourney({ ...defaultState, drone: { ...defaultState.drone, root: s.drone.root }, bpm: s.bpm, sounds: s.sounds }),
    name: `Journey ${nextJourneyNumber(saved)}`,
  };
  return { ...applyJourney(s, fresh), journeys: [...saved, fresh], activeJourney: saved.length };
}

/** A copy of this journey (with unsaved edits), placed after it, which becomes the active journey. */
export function duplicateJourney(s: BedState): BedState {
  if (s.journeys.length >= MAX_JOURNEYS) return s;
  const current = captureJourney(s);
  const copy: Journey = { ...current, name: `${current.name} copy` };
  const saved = s.journeys.map((j, i) => (i === s.activeJourney ? current : j));
  const at = s.activeJourney + 1;
  const list = [...saved.slice(0, at), copy, ...saved.slice(at)];
  return { ...applyJourney(s, copy), journeys: list, activeJourney: at };
}

/** Remove the active journey and move to its neighbour. The last journey cannot be deleted. */
export function deleteJourney(s: BedState): BedState {
  if (s.journeys.length < 2) return s;
  const list = s.journeys.filter((_, i) => i !== s.activeJourney);
  const at = Math.min(s.activeJourney, list.length - 1);
  return { ...applyJourney(s, list[at]), journeys: list, activeJourney: at };
}

export function renameJourney(s: BedState, name: string): BedState {
  return { ...s, journeyName: name.slice(0, 40) };
}

function nextJourneyNumber(list: Journey[]): number {
  let n = list.length + 1;
  while (list.some((j) => j.name === `Journey ${n}`)) n++;
  return n;
}

const baseState: Omit<BedState, 'scenes' | 'activeScene' | 'journeys' | 'activeJourney'> = {
  keyOffset: 0,
  dancer: defaultDancer,
  journeyName: 'Journey 1',
  profiles: defaultProfileChoice,
  bpm: 88,
  swing: 15,
  midiOut: true,
  synthOut: true,
  clock: false,
  clockTransport: false,
  clockLeadIn: 4,
  percussion: true,
  loops: {
    enabled: false,
    channel: 2,
    program: 0,
    sendBank: false,
    bankMSB: 0,
    bankLSB: 0,
    startCC: 0,
    stopCC: 0,
    favorites: '',
  },
  drums: [
    { name: 'Kick', enabled: true, note: 36, channel: 9, steps: 16, hits: 4, rotation: 0, velocity: 100, probability: 100, humanize: 20 },
    { name: 'Snare', enabled: true, note: 38, channel: 9, steps: 16, hits: 2, rotation: 4, velocity: 90, probability: 100, humanize: 25 },
    { name: 'Hat', enabled: true, note: 42, channel: 9, steps: 16, hits: 11, rotation: 0, velocity: 70, probability: 90, humanize: 50 },
    { name: 'Shaker', enabled: true, note: 82, channel: 9, steps: 5, hits: 3, rotation: 0, velocity: 60, probability: 80, humanize: 40 },
  ],
  drone: {
    enabled: true,
    channel: 0,
    root: 38, // D2
    fifth: true,
    octave: true,
    velocity: 75,
    retriggerBars: 0,
    follow: false,
  },
  wanderers: [
    { name: 'Cutoff', enabled: true, cc: 74, channel: 0, min: 15, max: 105, cycleBars: 8, looseness: 50, phase: 0, smoothBeats: 4, opposes: -1, opposeAmount: 70 },
    { name: 'Resonance', enabled: true, cc: 71, channel: 0, min: 25, max: 85, cycleBars: 12, looseness: 50, phase: 0, smoothBeats: 6, opposes: -1, opposeAmount: 70 },
    // Off by default. Moves the drum filter on channel 10 (index 9).
    // Moves AGAINST the bass and chord cutoff, so the whole mix does not brighten and darken together.
    { name: 'Drum cutoff', enabled: false, cc: 74, channel: 9, min: 40, max: 127, cycleBars: 10, looseness: 50, phase: 0, smoothBeats: 4, opposes: 0, opposeAmount: 70 },
  ],
  fade: { cc: 11, droneIn: 40, droneOut: 20, padIn: 40, padOut: 20, drumIn: 20, drumOut: 20 },
  pad: {
    enabled: true,
    channel: 1,
    velocity: 60,
    humanize: 30,
    follow: true,
    style: 0,
    register: 55,
    spread: false,
    voiceLead: true,
    strumMs: 40,
  },
  motion: defaultMotion,
  announce: false,
  transitions: defaultTransitions,
  recurring: defaultRecurring,
  advance: defaultAdvance,
  frozen: false,
  transitionUse: defaultTransitionUse,
  noiseVersion: NOISE_VERSION,
  transitionMinEighths: 1,
  harmony: {
    mode: 1, // Dorian
    preset: 5, // Folk turn
    count: 4,
    degrees: [1, 7, 4, 7],
    barsPerChord: 2,
  },
  sounds: [
    { name: 'Bass drone', channel: 0, program: 0, sendBank: false, bankMSB: 0, bankLSB: 0, favorites: '' },
    { name: 'Percussion', channel: 9, program: 0, sendBank: false, bankMSB: 0, bankLSB: 0, favorites: '' },
    // New slots go at the END so settings saved by earlier versions keep their positions.
    // Favorites are Rusty's good Synth One pad presets (Synth One's own numbers).
    { name: 'Chord pad', channel: 1, program: 12, sendBank: false, bankMSB: 0, bankLSB: 0, favorites: '12,16,20,26,39,55,63,75,80,82,99,113' },
  ],
};

/**
 * Starting scenes, so all four are different and usable out of the box:
 * 1 the full bed, 2 a breakdown (shaker, one long chord), 3 a lift
 * (Mixolydian, busier kick and hats), 4 drone only.
 */
function startingScenes(): SceneData[] {
  const b = baseState;
  const drumsWhere = (on: (name: string) => boolean) => b.drums.map((d) => ({ ...d, enabled: on(d.name) }));
  return [
    captureScene(b),
    captureScene({
      ...b,
      drums: drumsWhere((n) => n === 'Shaker'),
      harmony: { ...b.harmony, preset: 1, count: 1, barsPerChord: 4 },
    }),
    captureScene({
      ...b,
      drums: b.drums.map((d) => (d.name === 'Kick' ? { ...d, hits: 5 } : d.name === 'Hat' ? { ...d, hits: 9 } : d)),
      drone: { ...b.drone, follow: true },
      harmony: { ...b.harmony, mode: 4, preset: 3, count: 2, degrees: [1, 4, 4, 7] },
    }),
    captureScene({
      ...b,
      percussion: false,
      drums: drumsWhere(() => false),
      pad: { ...b.pad, enabled: false },
    }),
  ];
}

const stateWithoutJourneys: BedState = { ...baseState, activeScene: 0, scenes: startingScenes(), journeys: [], activeJourney: 0 };
export const defaultState: BedState = { ...stateWithoutJourneys, journeys: [captureJourney(stateWithoutJourneys)] };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note number to a name, using the C4 = 60 convention. */
export function noteName(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

/** "36, Bass drum" for GM drum notes, "62, D4" for everything else. */
export function drumNoteLabel(note: number): string {
  const gm = GM_DRUMS[note];
  return gm ? `${note}, ${gm}` : `${note}, ${noteName(note)}`;
}

/**
 * Pad note lists, one per chord of the harmony loop when following, or a single
 * steady chord on the key (the tonic of the mode) when not.
 */
export function padChords(s: BedState): number[][] {
  return buildPadChords({
    root: keyRoot(s),
    mode: s.harmony.mode,
    degrees: s.pad.follow ? s.harmony.degrees : [1],
    count: s.pad.follow ? s.harmony.count : 1,
    style: s.pad.style,
    register: s.pad.register,
    spread: s.pad.spread,
    voiceLead: s.pad.voiceLead,
  });
}

/** Bass note lists, one per chord of the harmony loop when following, or one steady list. */
export function droneChords(s: BedState): number[][] {
  return buildBassChords({
    root: keyRoot(s),
    mode: s.harmony.mode,
    degrees: s.harmony.degrees,
    count: s.harmony.count,
    follow: s.drone.follow,
    octave: s.drone.octave,
    fifth: s.drone.fifth,
  });
}

/** The bass the OTHER way round: following the chords if it normally is steady, and the reverse. */
export function droneAltChords(s: BedState): number[][] {
  return droneChords({ ...s, drone: { ...s.drone, follow: !s.drone.follow } });
}

/** Is the pad's normal setting already a steady fifths drone (the thing its breathing rule flips to)? */
export function padIsSteadyFifths(p: PadState): boolean {
  return !p.follow && p.style === 6;
}

/**
 * What the pad flips to: a steady root-and-fifth drone. If it already is one, it flips to
 * following the chords (plain triads) instead.
 */
export function padAltChords(s: BedState): number[][] {
  const alt: PadState = padIsSteadyFifths(s.pad) ? { ...s.pad, follow: true, style: 0 } : { ...s.pad, follow: false, style: 6 };
  return padChords({ ...s, pad: alt });
}

export function droneNotes(d: DroneState): number[] {
  const notes = [d.root];
  if (d.octave) notes.push(d.root + 12);
  if (d.fifth) notes.push(d.root + 7);
  return notes;
}

/**
 * Fill anything missing/mistyped in saved data with defaults, so a field added
 * in a later version never leaves old saved settings with undefined values
 * (Release builds crash silently on that). Arrays keep the DEFAULT length and
 * are merged by index; unknown saved keys are dropped.
 */
export function mergeDefaults<T>(def: T, raw: unknown): T {
  if (Array.isArray(def)) {
    const src = Array.isArray(raw) ? raw : [];
    return def.map((d, i) => mergeDefaults(d, src[i])) as unknown as T;
  }
  if (def !== null && typeof def === 'object') {
    const src = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(def as Record<string, unknown>)) {
      out[key] = mergeDefaults((def as Record<string, unknown>)[key], src[key]);
    }
    return out as T;
  }
  return (typeof raw === typeof def && raw !== undefined && !(typeof raw === 'number' && !Number.isFinite(raw)) ? raw : def) as T;
}

// Chord-loop settings used to live inside the pad. Carry saved ones over to
// `harmony` (live settings and every scene) before merging, or they would be lost.
const HARMONY_KEYS = ['mode', 'preset', 'count', 'degrees', 'barsPerChord'];

function liftHarmony(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const r = { ...(raw as Record<string, unknown>) };
  const pad = r.pad;
  if (r.harmony === undefined && pad !== null && typeof pad === 'object') {
    const h: Record<string, unknown> = {};
    for (const k of HARMONY_KEYS) {
      const v = (pad as Record<string, unknown>)[k];
      if (v !== undefined) h[k] = v;
    }
    if (Object.keys(h).length > 0) r.harmony = h;
  }
  return r;
}

// Breathing settings saved before presets existed have rules but no preset: they are "Custom",
// not the default "Off", or the screen would name them wrongly.
function markCustomMotion(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const r = { ...(raw as Record<string, unknown>) };
  const m = r.motion;
  if (m !== null && typeof m === 'object' && (m as Record<string, unknown>).preset === undefined) {
    r.motion = { ...(m as Record<string, unknown>), preset: 0 };
  }
  return r;
}

// Filter movement used to be set in seconds (speed in percent per second, smoothing in tenths of a
// second). Convert saved settings, live and in every scene, to bars and beats at 88 BPM so each
// keeps its pace, and keep it fully free (looseness 100) with no opposition, exactly as it was.
function convertOneWanderer(w: unknown): unknown {
  if (w === null || typeof w !== 'object') return w;
  const o = w as Record<string, unknown>;
  if (o.cycleBars !== undefined || (o.speed === undefined && o.smooth === undefined)) return w;
  const { speed, smooth, ...rest } = o;
  return {
    ...rest,
    cycleBars: typeof speed === 'number' ? cycleBarsFromOldSpeed(speed) : undefined,
    smoothBeats: typeof smooth === 'number' ? smoothBeatsFromOldSmooth(smooth) : undefined,
    looseness: 100,
    opposes: -1,
  };
}

function convertWanderers(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const r = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(r.wanderers)) r.wanderers = r.wanderers.map(convertOneWanderer);
  return r;
}

// Transition levels saved before noise version 2 were on a louder scale for every shape but
// the Boom. Convert them once, so the mix sounds the same after the upgrade.
function upgradeNoiseLevels(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const r = { ...(raw as Record<string, unknown>) };
  const t = r.transitions;
  if (r.noiseVersion === undefined && t !== null && typeof t === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, slot] of Object.entries(t as Record<string, unknown>)) {
      const sl = slot as Record<string, unknown> | null;
      next[key] =
        sl && typeof sl === 'object' && typeof sl.level === 'number' && sl.shape !== 3
          ? { ...sl, level: Math.min(100, Math.round(sl.level * 5)) }
          : slot;
    }
    r.transitions = next;
  }
  return r;
}

export function migrateState(rawInput: unknown): BedState {
  const lifted = markCustomMotion(liftHarmony(upgradeNoiseLevels(convertWanderers(rawInput))));
  const raw =
    lifted !== null && typeof lifted === 'object' && Array.isArray((lifted as Record<string, unknown>).scenes)
      ? {
          ...(lifted as Record<string, unknown>),
          scenes: ((lifted as Record<string, unknown>).scenes as unknown[]).map((sc) => convertWanderers(markCustomMotion(liftHarmony(sc)))),
        }
      : lifted;
  const merged0 = mergeDefaults(defaultState, raw);
  // A saved mode that no longer exists (Locrian) becomes the last one; keep scenes in step.
  const merged: BedState = {
    ...merged0,
    harmony: { ...merged0.harmony, mode: clampMode(merged0.harmony.mode) },
    scenes: merged0.scenes.map((sc) => ({ ...sc, harmony: { ...sc.harmony, mode: clampMode(sc.harmony.mode) } })),
  };
  const active = Math.max(0, Math.min(merged.scenes.length - 1, Math.round(merged.activeScene)));
  const keyOffset = wrapOffset(Number.isFinite(merged.keyOffset) ? merged.keyOffset : 0);
  // The live settings ARE the active scene; keep the stored copy in step with them.
  // Names are labels, not user data: always take the current ones, so a rename
  // (e.g. 'Drone synth' -> 'Bass drone') reaches settings saved by older versions.
  const sounds = merged.sounds.map((sl, i) => ({ ...sl, name: defaultState.sounds[i]?.name ?? sl.name }));
  const live: BedState = {
    ...merged,
    keyOffset,
    frozen: false, // never come back frozen
    sounds,
    activeScene: active,
    scenes: merged.scenes.map((sc, i) => (i === active ? captureScene({ ...merged, keyOffset }) : sc)),
  };
  // Journeys: settings saved before they existed become "Journey 1". The live settings ARE the
  // active journey; the others are merged against a default journey so new fields get defaults.
  const rawList = raw !== null && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).journeys)
    ? ((raw as Record<string, unknown>).journeys as unknown[])
    : [];
  const rawActive = Number((raw as Record<string, unknown> | null)?.activeJourney);
  const count = Math.max(1, Math.min(MAX_JOURNEYS, rawList.length));
  const activeJ = Number.isFinite(rawActive) ? Math.max(0, Math.min(count - 1, Math.round(rawActive))) : 0;
  const template = captureJourney(defaultState);
  const journeys: Journey[] = [];
  for (let i = 0; i < count; i++) {
    if (i === activeJ) {
      journeys.push(captureJourney(live));
    } else {
      const j = mergeDefaults(template, rawList[i]);
      journeys.push({
        ...j,
        activeScene: Math.max(0, Math.min(j.scenes.length - 1, j.activeScene)),
        scenes: j.scenes.map((sc) => ({ ...sc, keyOffset: wrapOffset(sc.keyOffset), harmony: { ...sc.harmony, mode: clampMode(sc.harmony.mode) } })),
      });
    }
  }
  return { ...live, journeys, activeJourney: activeJ };
}

/** Shape the native engine expects (MidiBedConfig in MidiBedEngine.swift). */
export function toEngineJson(s: BedState): string {
  return JSON.stringify({
    bpm: s.bpm,
    swing: s.swing / 100,
    midiOut: s.midiOut,
    synthOut: s.synthOut,
    clock: s.clock,
    clockTransport: s.clockTransport,
    clockLeadInBeats: s.clockLeadIn,
    sceneIndex: s.activeScene,
    frozen: s.frozen,
    advance: {
      mode: s.advance.mode,
      bars: advanceBars(s.advance, s.harmony),
      target: pickTarget(s.advance, s.activeScene, s.scenes.length, 0),
    },
    loops: {
      enabled: s.loops.enabled,
      channel: s.loops.channel,
      program: s.loops.program,
      bankMSB: s.loops.sendBank ? s.loops.bankMSB : -1,
      bankLSB: s.loops.sendBank ? s.loops.bankLSB : -1,
      startCC: s.loops.startCC,
      stopCC: s.loops.stopCC,
    },
    drums: s.drums.map((d) => ({
      enabled: s.percussion && d.enabled,
      role: drumRole(d.name),
      note: d.note,
      channel: d.channel,
      steps: d.steps,
      hits: d.hits,
      rotation: d.rotation,
      velocity: d.velocity,
      probability: d.probability / 100,
      humanize: d.humanize / 100,
    })),
    drone: {
      enabled: s.drone.enabled,
      channel: s.drone.channel,
      chords: droneChords(s),
      altChords: droneAltChords(s),
      velocity: s.drone.velocity,
      retriggerBars: s.drone.retriggerBars,
    },
    pad: {
      enabled: s.pad.enabled,
      channel: s.pad.channel,
      velocity: s.pad.velocity,
      humanize: s.pad.humanize / 100,
      strumMs: s.pad.strumMs,
      chords: padChords(s),
      altChords: padAltChords(s),
    },
    motion: s.motion,
    transitions: {
      minLeadBeats: s.transitionMinEighths / 2,
      entrance: { ...s.transitions.entrance, on: s.transitions.entrance.on && s.transitionUse.entrance, level: s.transitions.entrance.level / 100 },
      drumBreak: { ...s.transitions.drumBreak, on: s.transitions.drumBreak.on && s.transitionUse.drumBreak, level: s.transitions.drumBreak.level / 100 },
      drumReturn: { ...s.transitions.drumReturn, on: s.transitions.drumReturn.on && s.transitionUse.drumReturn, level: s.transitions.drumReturn.level / 100 },
      recurring: {
        on: s.recurring.on && s.transitionUse.recurring,
        when: s.recurring.when,
        everyBars: s.recurring.everyBars,
        chance: s.recurring.chance,
        vary: s.recurring.vary,
        shape: s.recurring.shape,
        shapeMask: shapeMask(s.recurring.shapes),
        colorMode: s.recurring.colorMode,
        color: s.recurring.color,
        beats: s.recurring.beats,
        level: s.recurring.level / 100,
      },
    },
    harmony: { barsPerChord: s.harmony.barsPerChord, count: s.harmony.count },
    dancer: {
      enabled: s.dancer.enabled,
      channel: s.dancer.channel,
      spaceMult: s.dancer.spaceMult,
      pick: s.dancer.pick,
      phrases: s.dancer.enabled ? makePhrases(s.dancer, s.harmony.mode, keyRoot(s)) : [],
    },
    fade: {
      cc: s.fade.cc,
      droneIn: s.fade.droneIn / 10,
      droneOut: s.fade.droneOut / 10,
      padIn: s.fade.padIn / 10,
      padOut: s.fade.padOut / 10,
      drumIn: s.fade.drumIn / 10,
      drumOut: s.fade.drumOut / 10,
    },
    wanderers: s.wanderers.map((w) => ({
      enabled: w.enabled,
      cc: w.cc,
      channel: w.channel,
      min: w.min,
      max: w.max,
      cycleBars: w.cycleBars,
      looseness: w.looseness / 100,
      phase: phaseOffset(w.phase),
      smoothBeats: w.smoothBeats,
      opposes: w.opposes,
      opposeAmount: w.opposeAmount / 100,
    })),
  });
}

/**
 * Every scene as a full engine configuration, as a JSON array, so the engine can move to the next
 * scene BY ITSELF on a bar line (auto-advance). The scene being played is the live settings; the
 * others are their saved copies laid over the global settings.
 */
export function sceneConfigsJson(s: BedState): string {
  return (
    '[' +
    s.scenes
      .map((sc, i) => toEngineJson({ ...(i === s.activeScene ? s : applyScene(s, sc)), activeScene: i }))
      .join(',') +
    ']'
  );
}
