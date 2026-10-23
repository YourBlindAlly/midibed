import { FxState, defaultFx } from './uglyfx';
import { EndingState, defaultEnding, endingObject } from './ending';
import { defaultSectionUi } from './sectionui';
import { presetOwnsChannel } from './filters';
import { clampOutputMode } from './outputmode';
import { RHYTHMS, clampRhythm, rhythmMask } from './rhythms';
import { LaneState, defaultLanes, lanesForEngine, parseLibrary, resolveLoopId } from './looplib';
import { buildBassChords, buildPadChords, clampColor, clampMode, MAX_CHORDS } from './chords';
import { AdvanceRule, advanceBars, defaultAdvance, pickTarget } from './advance';
import { DancerState, defaultDancer, makePhrases } from './dancer';
import { buildBassColorNotes } from './bassrhythm';
import { KeysVoiceState, defaultKeysVoice } from './keysvoice';
import { PadVoiceState, defaultPadVoice } from './padvoice';
import { groupsForWants, parsePacks } from './packs';
import { NetworkState, defaultNetwork } from './network';
import { KEYS_RHYTHMS, KeysState, clampKeysRhythm, defaultKeys, keysMask } from './keys';
import type { Layer } from './shortcuts';
import { cycleBarsFromOldSpeed, phaseOffset, smoothBeatsFromOldSmooth } from './wander';
import { MotionState, defaultMotion, drumRole } from './motion';
import {
  NOISE_VERSION,
  RecurringState,
  TransitionUse,
  TransitionsState,
  TransitionSlot,
  defaultRecurring,
  defaultTransitionUse,
  defaultTransitions,
  shapeMask,
} from './transitions';
import { GM_DRUMS } from './gm';
import { ProfileChoice, defaultProfileChoice, getProfile } from './profiles';
import { BassVoiceState, defaultBassVoice } from './bassvoice';
import { FillState, defaultFill, fillPalette } from './fill';
import type { MidiControlState } from './midicontrol';
import { MixerState, defaultMixer } from './mixer';
import { Favorite, addFav, favsFromPrograms, parseFavMap, stringifyFavMap } from './soundFavs';

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
  /** A rhythm from the library (src/rhythms.ts) instead of the Euclidean spread; 0 = Euclidean. */
  rhythm: number;
  /** A second, quieter Euclidean layer on the steps the main pattern leaves free: ghost notes. 0 = none. */
  ghostHits: number;
  ghostRotation: number;
  ghostVelocity: number; // 1-127
  /** Every Nth hit of the main pattern is louder (0 = off, else 2-8), by accentBoost percent. */
  accentEvery: number;
  accentBoost: number; // percent 0-100
  /** Which hit the accents start on: 0 the first hit, 1 the second... (with accentEvery 3 and 1, only the second of three is accented). */
  accentOffset: number;
  /** The first hit of the pattern always plays, whatever the chance says. */
  keepFirst: boolean;
  /** Each hit lands up to this many milliseconds late, at random (0 = exactly on the grid). */
  looseMs: number;
  /** Built-in sound only (see drumvoice.ts): sound type and its controls. Global, not saved in a scene. */
  voice: number;
  tune: number;
  decay: number;
  tone: number;
  snap: number;
  level: number;
  /** How much each hit differs from the last, percent (see drumvoice.ts). Global like the other sound controls. */
  variation: number;
  /** The sample pack sound: which imported pack and which group of it. Global like the other sound controls. */
  packId: string;
  packGroup: string;
};

/** Patterns that change by themselves (scene-owned; the kick is never changed). */
export type EvolveState = {
  /** Change every N bars from the scene start; 0 = off. */
  everyBars: number;
  /** Chance (percent) that a given drum changes at each interval. */
  chance: number;
  /** After this many changes a drum returns to its own pattern. */
  returnAfter: number;
};

export const defaultEvolve: EvolveState = { everyBars: 0, chance: 50, returnAfter: 4 };

/** The pattern extras every drum starts with: all off, so existing sounds do not change. */
const drumExtras = { rhythm: 0, ghostHits: 0, ghostRotation: 0, ghostVelocity: 40, accentEvery: 0, accentOffset: 0, accentBoost: 30, keepFirst: false, looseMs: 0 };

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
  /** 0 a held drone, 1 notes on the kick, 2 notes between the kicks (see bassrhythm.ts). Saved per scene. */
  rhythm: number;
  /** Percent of the distance to the next kick hit that a rhythmic note lasts. */
  rhythmLength: number;
  /** 0 root only, 1 all the bass notes, 2 root with the octave on every other note. */
  rhythmNotes: number;
  /** 0 every kick, 1 every other kick (mode 1). */
  rhythmSkip: number;
  /** Percent of the rhythmic notes (after the first of each bar) that play a colour note instead of the root. 0 = never. */
  colorChance: number;
  /** Colour notes allowed: a step below the root; the root of the related key; the third of the related key. */
  colorBelow: boolean;
  /** 0 a whole step below, 1 the next note down the scale. */
  colorStep: number;
  colorRelRoot: boolean;
  colorRelThird: boolean;
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
  /** Older style (program numbers only). Now lifted into BedState.soundFavs at load and left empty. */
  favorites: string;
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
  degrees: number[]; // MAX_CHORDS slots, scale degree 1-7 each; first `count` are used
  /** MAX_CHORDS slots, parallel to degrees: the chord's colour (0 from the scale, 1 major, 2 minor, 3 sus 2, 4 sus 4). */
  colors: number[];
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
  /** The drums start at full volume at Play and when a scene brings a drum in (the fade-in is for switching one on by hand). */
  drumsHard: boolean;
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
  stopCC: number; // 0 = same as start (a toggle)
  /** Send the loop choice, start/stop and the clock out a second MIDI source, "MidiBed Loops", so the loops app hears only those. */
  ownPort: boolean;
  favorites: string; // comma-separated program numbers
};

export type PortsState = { bass: boolean; pad: boolean; dancer: boolean; drums: boolean; keys: boolean };

export type PartOutput = { midi: boolean; synth: boolean };
export type OutputsState = { bass: PartOutput; pad: PartOutput; dancer: PartOutput; drums: PartOutput; loops: PartOutput; keys: PartOutput };

export type BedState = {
  /** Per part: send it out as MIDI, and/or play it in the built-in sound. Global routing. */
  outputs: OutputsState;
  /** Drum fills (see fill.ts). Saved per scene. */
  fill: FillState;
  /** Patterns that evolve by themselves. Saved per scene. */
  evolve: EvolveState;
  /** The active scene's own name (optional, empty = none). Saved with the scene. */
  sceneName: string;
  /** The loop player's four lanes (src/looplib.ts). Saved with the scene. */
  lanes: LaneState[];
  /** The Loop player layer switch: off silences all four lanes (at the next bar line). Saved with the scene. */
  playerOn: boolean;
  /** The loop library, as JSON text (the audio files MidiBed has copied in). Global. */
  loopLib: string;
  /** The Loop player's overall level, percent (loops are loudness-matched first). Global. */
  loopMaster: number;
  /** Marks that the lane levels were reset once when loudness matching arrived (see resetLaneLevels). */
  loopMatchVersion: number;
  /** The built-in sound's output: 0 stereo, 1 mono both sides, 2 mono left only, 3 mono right only (src/outputmode.ts). Global. */
  outputMode: number;
  /** The filter movement (wanderers) on or off. Saved with the scene. */
  filterMove: boolean;
  /** A static filter preset (src/filters.ts; 0 = the wanderers). Saved with the scene. */
  filterPreset: number;
  /** Which module the preset goes to (0 the whole mix). Global. */
  filterFocus: number;
  /** Beats a preset takes to arrive. Global. */
  filterGlide: number;
  /** Holds the filters where they are (never comes back on). */
  filterHold: boolean;
  /** When a scene or journey change lands: 0 next bar, 1 end of the progression, 2 end of the scene (src/sceneChange.ts). Global. */
  sceneChangeAt: number;
  /** A MIDI controller (foot pedal) running the same actions as the keyboard shortcuts. Global. */
  midiControl: MidiControlState;
  /** The built-in bass voice (see bassvoice.ts). Global. */
  bassVoice: BassVoiceState;
  /** The built-in effects (src/uglyfx.ts): global, not in scenes or journeys. */
  fx: FxState;
  /** How Stop ends the music (src/ending.ts): global. */
  ending: EndingState;
  /** Which screen sections are open or closed, as JSON (src/sectionui.ts): global. */
  sectionUi: string;
  /** Hear only this part. Never saved as on (like Freeze): it silences the others by the normal fades. */
  solo: Layer | null;
  /** Per-part levels sent as volume control changes (see mixer.ts). Global. */
  mixer: MixerState;
  /** Hardware keyboard shortcuts while MidiBed is in front (see shortcuts.ts). */
  shortcuts: boolean;
  /** Which parts get their own MIDI source (MidiBed Bass, Pad, Dancer, Drums). Global routing. */
  ports: PortsState;
  /** Apps added by the user (JSON list of {id, name}); they get their own favorites. See profiles.ts. */
  customApps: string;
  /** Sound favorites per app (profile id), as JSON; see soundFavs.ts. Global, not saved in a scene or journey. */
  soundFavs: string;
  /** MidiDancer: call-and-response phrases on the key's scale. Everything but the channel is saved per scene. */
  dancer: DancerState;
  /** Keys: a rhythmic electric piano that comps the chords. Everything but the channel is saved per scene. */
  keys: KeysState;
  /** The Keys' built-in electric piano: its type and sound controls. Global, not saved in a scene. */
  keysVoice: KeysVoiceState;
  /** The chord pad's sound shape (wave, detune, drift, flange). Global, not saved in a scene. */
  padVoice: PadVoiceState;
  /** 1 = the Shaker slot has been moved to the softer egg shaker once (settings saved before this keep the sharp one until migrateState changes it, once). */
  drumSoundVersion: number;
  /** Show the sentences of explanation on the screens (Note). Global. */
  showNotes: boolean;
  /** Read the hints VoiceOver speaks after a control. Global. */
  readHints: boolean;
  /** The built-in sound plays every note on its exact sample, using a short built-in delay so timing stays tight and even (the music runs about a tenth of a second behind the clock). Off = the old immediate way. Global. */
  tightTiming: boolean;
  /** The imported sound packs (JSON text, see src/packs.ts). Global. */
  packLib: string;
  /** The live link to a recording program (Network MIDI + record signal). Global. */
  network: NetworkState;
  bpm: number;
  swing: number; // percent 0-100
  midiOut: boolean;
  synthOut: boolean;
  /** Send MIDI clock plus Start/Stop while playing, so other apps can follow the tempo. */
  clock: boolean;
  /** With the clock: also send MIDI Start at the beginning and Stop at the end. Off = clock pulses only. */
  clockTransport: boolean;
  /** With the clock: keep sending it while stopped too, so a follower stays locked to the tempo. */
  clockAlways: boolean;
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
  /** Stay on this scene: its automatic move-on (or end) is set aside until you change scene. Never saved as on. */
  stayHere: boolean;
  /** Per scene: which of those sounds this scene plays. */
  transitionUse: TransitionUse;
  /** Level-scale version of the saved transition levels (see NOISE_VERSION). */
  noiseVersion: number;
  /** A lead-in needs at least this many eighth notes before the change, or only its downer plays on the beat. */
  transitionMinEighths: number;
  /** Sound-pack swells: false = the loudest part lands on the bar line (default); true = the swell starts on the bar line. */
  swellOnBar: boolean;
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
  fill: FillState;
  /** Patterns that evolve by themselves. Saved per scene. */
  evolve: EvolveState;
  /** The scene's own name; empty when it has none. */
  name: string;
  lanes: LaneState[];
  playerOn: boolean;
  filterMove: boolean;
  filterPreset: number;
  dancer: Omit<DancerState, 'channel'>;
  keys: Omit<KeysState, 'channel'>;
  /** Semitones above the journey key; the scene's home note (see keyRoot). */
  keyOffset: number;
  swing: number;
  percussion: boolean;
  drone: Pick<DroneState, 'enabled' | 'octave' | 'fifth' | 'velocity' | 'retriggerBars' | 'follow' | 'rhythm' | 'rhythmLength' | 'rhythmNotes' | 'rhythmSkip' | 'colorChance' | 'colorBelow' | 'colorStep' | 'colorRelRoot' | 'colorRelThird'>;
  harmony: HarmonyState;
  motion: MotionState;
  advance: AdvanceRule;
  transitionUse: TransitionUse;
  pad: Omit<PadState, 'channel'>;
  drums: Omit<DrumState, 'name' | 'note' | 'channel' | 'voice' | 'tune' | 'decay' | 'tone' | 'snap' | 'level' | 'variation' | 'packId' | 'packGroup'>[];
  wanderers: Pick<WandererState, 'enabled' | 'min' | 'max' | 'cycleBars' | 'looseness' | 'phase' | 'smoothBeats' | 'opposes' | 'opposeAmount'>[];
  loops: Pick<LoopsState, 'enabled' | 'program' | 'sendBank' | 'bankMSB' | 'bankLSB'>;
};

export const SCENE_COUNT = 4;

type SceneSource = Pick<BedState, 'playerOn' | 'lanes' | 'filterMove' | 'filterPreset' | 'sceneName' | 'fill' | 'evolve' | 'dancer' | 'keys' | 'keyOffset' | 'swing' | 'percussion' | 'drone' | 'harmony' | 'motion' | 'advance' | 'transitionUse' | 'pad' | 'drums' | 'wanderers' | 'loops'>;

export function captureScene(s: SceneSource): SceneData {
  const { channel: _padChannel, ...pad } = s.pad;
  const { channel: _dancerChannel, ...dancer } = s.dancer;
  const { channel: _keysChannel, ...keys } = s.keys;
  return {
    fill: { ...s.fill },
    evolve: { ...s.evolve },
    name: s.sceneName,
    lanes: s.lanes.map((l) => ({ ...l })),
    playerOn: s.playerOn,
    filterMove: s.filterMove,
    filterPreset: s.filterPreset,
    dancer: { ...dancer },
    keys: { ...keys },
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
      rhythm: s.drone.rhythm,
      rhythmLength: s.drone.rhythmLength,
      rhythmNotes: s.drone.rhythmNotes,
      rhythmSkip: s.drone.rhythmSkip,
      colorChance: s.drone.colorChance,
      colorBelow: s.drone.colorBelow,
      colorStep: s.drone.colorStep,
      colorRelRoot: s.drone.colorRelRoot,
      colorRelThird: s.drone.colorRelThird,
    },
    harmony: { ...s.harmony, degrees: [...s.harmony.degrees], colors: [...s.harmony.colors] },
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
      rhythm: d.rhythm,
      ghostHits: d.ghostHits,
      ghostRotation: d.ghostRotation,
      ghostVelocity: d.ghostVelocity,
      accentEvery: d.accentEvery,
      accentBoost: d.accentBoost,
      accentOffset: d.accentOffset,
      keepFirst: d.keepFirst,
      looseMs: d.looseMs,
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
    fill: { ...sc.fill },
    evolve: { ...defaultEvolve, ...sc.evolve },
    sceneName: typeof sc.name === 'string' ? sc.name : '',
    lanes: Array.isArray(sc.lanes) ? defaultLanes().map((d, i) => ({ ...d, ...(sc.lanes[i] ?? {}) })) : defaultLanes(),
    playerOn: sc.playerOn !== false,
    filterMove: sc.filterMove !== false,
    filterPreset: typeof sc.filterPreset === 'number' ? sc.filterPreset : 0,
    dancer: { ...s.dancer, ...sc.dancer },
    keys: { ...s.keys, ...(sc.keys ?? {}) },
    keyOffset: sc.keyOffset,
    swing: sc.swing,
    percussion: sc.percussion,
    drone: { ...s.drone, ...sc.drone },
    harmony: {
      ...sc.harmony,
      degrees: Array.from({ length: MAX_CHORDS }, (_, k) => sc.harmony.degrees[k] ?? 1),
      colors: Array.from({ length: MAX_CHORDS }, (_, k) => clampColor(sc.harmony.colors?.[k] ?? 0)),
    },
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
  // The copy keeps the target scene's own name: names say which scene is which.
  return {
    ...s,
    scenes: s.scenes.map((sc, i) => (i === s.activeScene ? current : i === to ? { ...current, name: sc.name ?? '' } : sc)),
  };
}

/** What can be copied from one scene to another (index 0 = everything). */
export const SCENE_COPY_PARTS = [
  'Everything',
  'Drums, patterns, fills and swing',
  'Bass drone',
  'Chord pad',
  'MidiDancer',
  'Harmony and key change',
  'Breathing and transitions',
  'Filter movement',
  'Loops',
  'After this scene',
  'Loop player lanes',
  'Keys',
];

/** Copy one part of the current scene (including unsaved edits) into scene `to`; the rest of `to` stays. */
export function copyScenePart(s: BedState, to: number, what: number): BedState {
  if (to < 0 || to >= s.scenes.length || to === s.activeScene) return s;
  if (what <= 0 || what >= SCENE_COPY_PARTS.length) return copyScene(s, to);
  const cur = captureScene(s);
  const parts: Partial<SceneData>[] = [
    {},
    { drums: cur.drums, percussion: cur.percussion, fill: cur.fill, evolve: cur.evolve, swing: cur.swing },
    { drone: cur.drone },
    { pad: cur.pad },
    { dancer: cur.dancer },
    { harmony: cur.harmony, keyOffset: cur.keyOffset },
    { motion: cur.motion, transitionUse: cur.transitionUse },
    { wanderers: cur.wanderers },
    { loops: cur.loops },
    { advance: cur.advance },
    { lanes: cur.lanes },
    { keys: cur.keys },
  ];
  const piece = JSON.parse(JSON.stringify(parts[what])) as Partial<SceneData>;
  return {
    ...s,
    scenes: s.scenes.map((sc, i) => (i === s.activeScene ? cur : i === to ? { ...sc, ...piece } : sc)),
  };
}

export function renameScene(s: BedState, name: string): BedState {
  return { ...s, sceneName: name.slice(0, 30) };
}

/** "Scene 2" or "Scene 2, the lift". */
export function sceneLabel(s: Pick<BedState, 'scenes' | 'activeScene' | 'sceneName'>, index: number): string {
  const name = (index === s.activeScene ? s.sceneName : s.scenes[index]?.name) ?? '';
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed ? `Scene ${index + 1}, ${trimmed}` : `Scene ${index + 1}`;
}

/** What a silenced drum pattern remembers, so it can be brought back. */
export type DrumPatternMemory = { hits: number; rhythm: number; ghostHits: number }[];

/** Remember every drum's pattern settings (hits, library rhythm, ghost notes). */
export function rememberDrumPatterns(s: Pick<BedState, 'drums'>): DrumPatternMemory {
  return s.drums.map((d) => ({ hits: d.hits, rhythm: d.rhythm, ghostHits: d.ghostHits }));
}

/**
 * Silence every drum's pattern (hits 0, no library rhythm, no ghost notes) so a groove can be built up part
 * by part. Steps, rotation, velocity, sounds and the on/off switches stay as they are.
 */
export function silenceDrumPatterns(s: BedState): BedState {
  return { ...s, drums: s.drums.map((d) => ({ ...d, hits: 0, rhythm: 0, ghostHits: 0 })) };
}

/** Put the remembered pattern settings back. */
export function restoreDrumPatterns(s: BedState, memory: DrumPatternMemory): BedState {
  return {
    ...s,
    drums: s.drums.map((d, i) => (memory[i] ? { ...d, hits: memory[i].hits, rhythm: memory[i].rhythm, ghostHits: memory[i].ghostHits } : d)),
  };
}

/** Which app (profile id) a sound slot talks to: the slot's role decides. */
export function slotProfileId(s: Pick<BedState, 'profiles'>, slotName: string): string {
  return slotName === 'Bass drone' ? s.profiles.drone : slotName === 'Percussion' ? s.profiles.drums : s.profiles.pad;
}

/** Make `fav` the sound of slot `i` (program and bank). */
export function applyFavorite(s: BedState, i: number, fav: Favorite): BedState {
  return {
    ...s,
    sounds: s.sounds.map((sl, k) =>
      k === i ? { ...sl, program: fav.program, sendBank: fav.sendBank, bankMSB: fav.bankMSB, bankLSB: fav.bankLSB } : sl,
    ),
  };
}

/** Keep a key offset in -6..5 (the nearest way round the octave). */
/**
 * Which sound-pack groups the engine loads, and the number of each user's group: the drums that use the Sample pack sound,
 * then the transition sounds, the recurring sound and the ending sound that take a swell from a pack. Both what is sent to
 * the engine as the packs and every group number sent with the settings come from here, so they always agree.
 */
export function packPlan(s: Pick<BedState, 'packLib' | 'drums' | 'transitions' | 'recurring' | 'ending'>) {
  const wantOf = (o: { source?: number; noiseSource?: number; packId?: string; packGroup?: string; noisePackId?: string; noisePackGroup?: string }, ending = false) => {
    const on = ending ? o.noiseSource === 1 : o.source === 1;
    const id = (ending ? o.noisePackId : o.packId) ?? '';
    const group = (ending ? o.noisePackGroup : o.packGroup) ?? '';
    return on ? { packId: id, packGroup: group } : null;
  };
  const wants = [
    ...s.drums.map((d) => (d.voice === 17 ? { packId: d.packId, packGroup: d.packGroup } : null)),
    wantOf(s.transitions.entrance),
    wantOf(s.transitions.drumBreak),
    wantOf(s.transitions.drumReturn),
    wantOf(s.recurring),
    wantOf(s.ending, true),
  ];
  const r = groupsForWants(parsePacks(s.packLib), wants);
  const n = s.drums.length;
  return {
    groups: r.groups,
    drumGroup: r.index.slice(0, n),
    entrance: r.index[n],
    drumBreak: r.index[n + 1],
    drumReturn: r.index[n + 2],
    recurring: r.index[n + 3],
    ending: r.index[n + 4],
  };
}

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
  outputs: {
    bass: { midi: true, synth: true },
    pad: { midi: true, synth: true },
    dancer: { midi: true, synth: true },
    drums: { midi: true, synth: true },
    loops: { midi: true, synth: true },
    keys: { midi: true, synth: true },
  },
  fill: defaultFill,
  evolve: defaultEvolve,
  sceneName: '',
  lanes: defaultLanes(),
  playerOn: true,
  loopLib: '[]',
  loopMaster: 100,
  loopMatchVersion: 1,
  outputMode: 0,
  filterMove: true,
  filterPreset: 0,
  filterFocus: 0,
  filterGlide: 2,
  filterHold: false,
  sceneChangeAt: 0,
  midiControl: { enabled: true, channel: -1, map: '{}', double: '{}', doubleMs: 400, hold: '{}', holdMs: 700, releases: false, announceDevices: true },
  bassVoice: defaultBassVoice,
  fx: defaultFx,
  ending: defaultEnding,
  sectionUi: JSON.stringify(defaultSectionUi),
  solo: null,
  mixer: defaultMixer,
  shortcuts: true,
  ports: { bass: false, pad: false, dancer: false, drums: false, keys: false },
  customApps: '[]',
  // Rusty's good Synth One pad presets, kept under the Synth One app.
  soundFavs: stringifyFavMap({ synthone: favsFromPrograms(parseFavorites(getProfile('synthone').favorites ?? '')) }),
  dancer: defaultDancer,
  keys: defaultKeys,
  keysVoice: defaultKeysVoice,
  padVoice: defaultPadVoice,
  drumSoundVersion: 1,
  showNotes: true,
  readHints: true,
  tightTiming: true,
  packLib: '[]',
  network: defaultNetwork,
  journeyName: 'Journey 1',
  profiles: defaultProfileChoice,
  bpm: 88,
  swing: 15,
  midiOut: true,
  synthOut: true,
  clock: false,
  clockTransport: false,
  clockAlways: true,
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
    ownPort: false,
    favorites: '',
  },
  drums: ([
    { name: 'Kick', enabled: true, note: 36, channel: 9, steps: 16, hits: 4, rotation: 0, velocity: 100, probability: 100, humanize: 20, voice: 0, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 100 },
    { name: 'Snare', enabled: true, note: 38, channel: 9, steps: 16, hits: 2, rotation: 4, velocity: 90, probability: 100, humanize: 25, voice: 1, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 100 },
    { name: 'Hat', enabled: true, note: 42, channel: 9, steps: 16, hits: 11, rotation: 0, velocity: 70, probability: 90, humanize: 50, voice: 4, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 60 },
    { name: 'Shaker', enabled: true, note: 82, channel: 9, steps: 5, hits: 3, rotation: 0, velocity: 60, probability: 80, humanize: 40, voice: 14, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 40 },
    // More drums, off to begin with. Any slot can be any built-in sound (see drumvoice.ts).
    { name: 'Tambourine', enabled: false, note: 54, channel: 9, steps: 16, hits: 4, rotation: 2, velocity: 60, probability: 80, humanize: 40, voice: 9, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 50 },
    { name: 'Low tom', enabled: false, note: 45, channel: 9, steps: 16, hits: 3, rotation: 6, velocity: 80, probability: 70, humanize: 30, voice: 10, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 100 },
    { name: 'Mid tom', enabled: false, note: 47, channel: 9, steps: 16, hits: 3, rotation: 3, velocity: 78, probability: 70, humanize: 30, voice: 11, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 100 },
    { name: 'High tom', enabled: false, note: 50, channel: 9, steps: 16, hits: 2, rotation: 10, velocity: 76, probability: 70, humanize: 30, voice: 12, tune: 0, decay: 100, tone: 50, snap: 50, level: 100, variation: 100 },
  ] as Omit<DrumState, keyof typeof drumExtras | 'packId' | 'packGroup'>[]).map((d) => ({ ...d, ...drumExtras, packId: '', packGroup: '' })),
  drone: {
    enabled: true,
    channel: 0,
    root: 38, // D2
    fifth: true,
    octave: true,
    velocity: 75,
    retriggerBars: 0,
    follow: false,
    rhythm: 0,
    rhythmLength: 70,
    rhythmNotes: 0,
    rhythmSkip: 0,
    colorChance: 0,
    colorBelow: true,
    colorStep: 0,
    colorRelRoot: false,
    colorRelThird: false,
  },
  wanderers: [
    { name: 'Cutoff', enabled: true, cc: 74, channel: 0, min: 15, max: 105, cycleBars: 8, looseness: 50, phase: 0, smoothBeats: 4, opposes: -1, opposeAmount: 70 },
    { name: 'Resonance', enabled: true, cc: 71, channel: 0, min: 25, max: 85, cycleBars: 12, looseness: 50, phase: 0, smoothBeats: 6, opposes: -1, opposeAmount: 70 },
    // Off by default. Moves the drum filter on channel 10 (index 9).
    // Moves AGAINST the bass and chord cutoff, so the whole mix does not brighten and darken together.
    { name: 'Drum cutoff', enabled: false, cc: 74, channel: 9, min: 40, max: 127, cycleBars: 10, looseness: 50, phase: 0, smoothBeats: 4, opposes: 0, opposeAmount: 70 },
  ],
  fade: { cc: 11, droneIn: 40, droneOut: 20, padIn: 40, padOut: 20, drumIn: 20, drumOut: 20, drumsHard: true },
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
  stayHere: false,
  transitionUse: defaultTransitionUse,
  noiseVersion: NOISE_VERSION,
  transitionMinEighths: 1,
  swellOnBar: false,
  harmony: {
    mode: 1, // Dorian
    preset: 5, // Folk turn
    count: 4,
    degrees: [1, 7, 4, 7, 1, 1, 1, 1, 1, 1, 1, 1],
    colors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    barsPerChord: 2,
  },
  sounds: [
    { name: 'Bass drone', channel: 0, program: 0, sendBank: false, bankMSB: 0, bankLSB: 0, favorites: '' },
    { name: 'Percussion', channel: 9, program: 0, sendBank: false, bankMSB: 0, bankLSB: 0, favorites: '' },
    // New slots go at the END so settings saved by earlier versions keep their positions.
    // Favorites are Rusty's good Synth One pad presets (Synth One's own numbers).
    { name: 'Chord pad', channel: 1, program: 12, sendBank: false, bankMSB: 0, bankLSB: 0, favorites: '' },
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
      harmony: { ...b.harmony, mode: 4, preset: 3, count: 2, degrees: [1, 4, 4, 7, 1, 1, 1, 1, 1, 1, 1, 1] },
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
    colors: s.pad.follow ? s.harmony.colors : [0],
    style: s.pad.style,
    register: s.pad.register,
    spread: s.pad.spread,
    voiceLead: s.pad.voiceLead,
  });
}

/** The keys' chords, one per chord of the harmony loop, voice-led in the keys' register. */
export function keysChords(s: BedState, style = s.keys.style): number[][] {
  return buildPadChords({
    root: keyRoot(s),
    mode: s.harmony.mode,
    degrees: s.harmony.degrees,
    count: s.harmony.count,
    colors: s.harmony.colors,
    style,
    register: s.keys.register,
    spread: false,
    voiceLead: s.keys.voiceLead,
  });
}

/** The same chords as suspended (sus 4) chords, for the occasional sus hit. */
export function keysSusChords(s: BedState): number[][] {
  return s.keys.susChance > 0 ? keysChords(s, 2) : [];
}

/** The keys as the engine takes them (the pattern fields mirror a drum's, so the engine plays it the same way). */
function keysForEngine(s: BedState) {
  const k = s.keys;
  const lib = k.rhythm > 0 ? KEYS_RHYTHMS[clampKeysRhythm(k.rhythm)] : null;
  const steps = lib ? lib.steps : Math.max(1, Math.min(32, k.steps));
  return {
    enabled: s.solo ? s.solo === 'keys' : k.enabled,
    channel: k.channel,
    steps,
    hits: lib ? lib.hits.length : Math.min(steps, k.hits),
    mask: lib ? keysMask(k.rhythm) : 0,
    useMask: !!lib,
    rotation: k.rotation,
    velocity: k.velocity,
    probability: k.probability / 100,
    humanize: k.humanize / 100,
    ghostHits: Math.min(k.ghostHits, steps),
    ghostRotation: k.ghostRotation,
    ghostVelocity: k.ghostVelocity,
    accentEvery: k.accentEvery,
    accentBoost: k.accentBoost / 100,
    accentOffset: k.accentOffset,
    keepFirst: k.keepFirst,
    looseMs: k.looseMs,
    lengthPct: k.length,
    strumMs: k.strumMs,
    susChance: k.susChance / 100,
    follow: k.follow,
    followSkip: k.followSkip,
    chords: keysChords(s),
    susChords: keysSusChords(s),
  };
}

/** Bass note lists, one per chord of the harmony loop when following, or one steady list. */
export function droneChords(s: BedState): number[][] {
  return buildBassChords({
    root: keyRoot(s),
    mode: s.harmony.mode,
    degrees: s.harmony.degrees,
    count: s.harmony.count,
    colors: s.harmony.colors,
    follow: s.drone.follow,
    octave: s.drone.octave,
    fifth: s.drone.fifth,
  });
}

/** The bass colour notes for each chord (see bassrhythm.ts); `alt` is the other version (follow <-> steady) used while the bass breathes. */
export function bassColorNotes(s: BedState, alt = false): number[][] {
  if (s.drone.colorChance <= 0 || s.drone.rhythm === 0) return [];
  const follow = alt ? !s.drone.follow : s.drone.follow;
  return buildBassColorNotes({
    root: keyRoot(s),
    mode: s.harmony.mode,
    degrees: s.harmony.degrees,
    count: s.harmony.count,
    colors: s.harmony.colors,
    follow,
    octave: s.drone.octave,
    fifth: s.drone.fifth,
    below: s.drone.colorBelow,
    stepKind: s.drone.colorStep,
    relRoot: s.drone.colorRelRoot,
    relThird: s.drone.colorRelThird,
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

/**
 * Point lanes at the loops the library really has: a lane (live, in a scene, in a journey) that names a loop
 * the library does not hold under that id but holds under another folder name gets that id. Returns the same
 * object when nothing changes, so it is safe to run whenever the library changes.
 */
export function resolveLaneIds(s: BedState): BedState {
  const lib = parseLibrary(s.loopLib);
  if (lib.length === 0) return s;
  let changed = false;
  const fixLanes = (lanes: LaneState[] | undefined): LaneState[] | undefined => {
    if (!Array.isArray(lanes)) return lanes;
    let any = false;
    const out = lanes.map((l) => {
      const id = resolveLoopId(lib, l.loop);
      if (id === l.loop) return l;
      any = true;
      return { ...l, loop: id };
    });
    if (any) changed = true;
    return any ? out : lanes;
  };
  const fixScene = (sc: SceneData): SceneData => {
    const lanes = fixLanes(sc.lanes);
    return lanes === sc.lanes ? sc : { ...sc, lanes: lanes as LaneState[] };
  };
  const lanes = fixLanes(s.lanes) as LaneState[];
  const scenes = s.scenes.map(fixScene);
  const journeys = s.journeys.map((j) => {
    const js = j.scenes.map(fixScene);
    return js.some((x, i) => x !== j.scenes[i]) ? { ...j, scenes: js } : j;
  });
  if (journeys.some((x, i) => x !== s.journeys[i])) changed = true;
  if (scenes.some((x, i) => x !== s.scenes[i])) changed = true;
  return changed ? { ...s, lanes, scenes, journeys } : s;
}

/**
 * A lane saved with the short-lived `keepPitch` setting becomes `follow: !keepPitch` (walks the whole saved
 * structure: the live lanes, every scene, every journey's scenes).
 */
export function convertKeepPitch(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(convertKeepPitch);
  if (raw !== null && typeof raw === 'object') {
    const src = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src)) out[k] = k === 'keepPitch' ? undefined : convertKeepPitch(src[k]);
    if (typeof src.keepPitch === 'boolean' && out.follow === undefined) out.follow = !src.keepPitch;
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  }
  return raw;
}

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

/**
 * Loudness matching arrived (loops are now brought to the level of the bed when they are added), so lane
 * levels that were turned down to compensate are put back to 100 percent, once (live, in every scene and in
 * every journey's scenes). Marked by `loopMatchVersion`.
 */
export const LOOP_MATCH_VERSION = 1;
function resetLaneLevels(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;
  if (typeof r.loopMatchVersion === 'number' && r.loopMatchVersion >= LOOP_MATCH_VERSION) return raw;
  const fixLanes = (lanes: unknown): unknown =>
    Array.isArray(lanes) ? lanes.map((l) => (l && typeof l === 'object' ? { ...(l as object), level: 100 } : l)) : lanes;
  const fixScene = (sc: unknown): unknown => {
    if (sc === null || typeof sc !== 'object' || !('lanes' in (sc as object))) return sc;
    return { ...(sc as Record<string, unknown>), lanes: fixLanes((sc as Record<string, unknown>).lanes) };
  };
  const out: Record<string, unknown> = { ...r, loopMatchVersion: LOOP_MATCH_VERSION };
  if (r.lanes !== undefined) out.lanes = fixLanes(r.lanes);
  if (Array.isArray(r.scenes)) out.scenes = r.scenes.map(fixScene);
  if (Array.isArray(r.journeys)) {
    out.journeys = r.journeys.map((j) => {
      if (j === null || typeof j !== 'object' || !Array.isArray((j as Record<string, unknown>).scenes)) return j;
      return { ...(j as Record<string, unknown>), scenes: ((j as Record<string, unknown>).scenes as unknown[]).map(fixScene) };
    });
  }
  return out;
}

export function migrateState(rawInput0: unknown): BedState {
  const rawInput = resetLaneLevels(rawInput0);
  const lifted = markCustomMotion(liftHarmony(upgradeNoiseLevels(convertWanderers(convertKeepPitch(rawInput)))));
  const raw =
    lifted !== null && typeof lifted === 'object' && Array.isArray((lifted as Record<string, unknown>).scenes)
      ? {
          ...(lifted as Record<string, unknown>),
          scenes: ((lifted as Record<string, unknown>).scenes as unknown[]).map((sc) => convertWanderers(markCustomMotion(liftHarmony(sc)))),
        }
      : lifted;
  const merged0 = mergeDefaults(defaultState, raw);
  // A saved mode that no longer exists (Locrian) becomes the last one; keep scenes in step.
  // Settings saved before the egg shaker existed: the Shaker slot moves to it ONCE (the old one sounded like a
  // cabasa; the sharp sound is still a choice in the slot's sound type).
  const hadDrumSoundVersion = rawInput !== null && typeof rawInput === 'object' && typeof (rawInput as Record<string, unknown>).drumSoundVersion === 'number';
  const merged: BedState = {
    ...merged0,
    drums: hadDrumSoundVersion ? merged0.drums : merged0.drums.map((d) => (d.name === 'Shaker' && d.voice === 6 ? { ...d, voice: 14 } : d)),
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
    stayHere: false, // nor staying
    filterHold: false, // nor held
    outputMode: clampOutputMode((merged as { outputMode?: number }).outputMode ?? 0),
    solo: null, // never come back soloed
    sounds,
    activeScene: active,
    scenes: merged.scenes.map((sc, i) => (i === active ? captureScene({ ...merged, keyOffset }) : sc)),
  };
  // Favorites: lists saved on a sound slot (program numbers only) move to the app that slot talks to.
  let soundFavs = live.soundFavs;
  for (const sl of live.sounds) {
    for (const program of parseFavorites(sl.favorites)) {
      soundFavs = addFav(soundFavs, slotProfileId(live, sl.name), { name: '', program, sendBank: false, bankMSB: 0, bankLSB: 0 });
    }
  }
  live.soundFavs = stringifyFavMap(parseFavMap(soundFavs));
  live.sounds = live.sounds.map((sl) => ({ ...sl, favorites: '' }));
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
const slotForEngine = (t: { on: boolean; shape: number; color: number; beats: number; level: number }) => ({ on: t.on, shape: t.shape, color: t.color, beats: t.beats, level: t.level });
const sampleOf = (i: number) => (i >= 0 ? { sample: i } : {});

export function toEngineJson(s: BedState): string {
  const plan = packPlan(s);
  return JSON.stringify({
    bpm: s.bpm,
    swing: s.swing / 100,
    midiOut: s.midiOut,
    synthOut: s.synthOut,
    clock: s.clock,
    clockTransport: s.clockTransport,
    clockAlways: s.clockAlways,
    sceneIndex: s.activeScene,
    frozen: s.frozen,
    filterHold: s.filterHold,
    sceneChangeAt: s.sceneChangeAt,
    // The Loop player layer: off (or another layer soloed) silences every lane.
    lanes: lanesForEngine(s.lanes, s.loopLib, s.loopMaster, s.bpm).map((l) => ({ ...l, on: l.on && (s.solo ? s.solo === 'player' : s.playerOn) })),
    // "Stay on this scene" sets the automatic move-on (or the end of the piece) aside until the scene changes.
    advance: s.stayHere
      ? { mode: 0, bars: 0, target: -1 }
      : {
          mode: s.advance.mode,
          bars: advanceBars(s.advance, s.harmony),
          target: pickTarget(s.advance, s.activeScene, s.scenes.length, 0),
          // "End the piece": the ending to play when this scene's bars are up
          ...(s.advance.mode === 4 ? { ending: endingObject(s.ending, plan.ending) } : {}),
        },
    loops: {
      enabled: s.solo ? s.solo === 'loops' : s.loops.enabled,
      channel: s.loops.channel,
      program: s.loops.program,
      bankMSB: s.loops.sendBank ? s.loops.bankMSB : -1,
      bankLSB: s.loops.sendBank ? s.loops.bankLSB : -1,
      startCC: s.loops.startCC,
      stopCC: s.loops.stopCC,
      ownPort: s.loops.ownPort,
    },
    drums: s.drums.map((d) => ({
      enabled: (s.solo ? s.solo === 'drums' : s.percussion) && d.enabled,
      role: drumRole(d.name),
      note: d.note,
      channel: d.channel,
      // A library rhythm brings its own number of steps and replaces the Euclidean spread with a fixed mask.
      steps: d.rhythm > 0 ? RHYTHMS[clampRhythm(d.rhythm)].steps : d.steps,
      hits: d.rhythm > 0 ? RHYTHMS[clampRhythm(d.rhythm)].hits.length : d.hits,
      mask: d.rhythm > 0 ? rhythmMask(d.rhythm) : 0,
      useMask: d.rhythm > 0,
      rotation: d.rotation,
      velocity: d.velocity,
      probability: d.probability / 100,
      humanize: d.humanize / 100,
      ghostHits: Math.min(d.ghostHits, d.rhythm > 0 ? RHYTHMS[clampRhythm(d.rhythm)].steps : d.steps),
      ghostRotation: d.ghostRotation,
      ghostVelocity: d.ghostVelocity,
      accentEvery: d.accentEvery,
      accentBoost: d.accentBoost / 100,
      accentOffset: d.accentOffset,
      keepFirst: d.keepFirst,
      looseMs: d.looseMs,
    })),
    evolve: {
      everyBars: s.evolve.everyBars,
      chance: s.evolve.chance / 100,
      returnAfter: Math.max(1, s.evolve.returnAfter),
    },
    drone: {
      enabled: s.solo ? s.solo === 'bass' : s.drone.enabled,
      channel: s.drone.channel,
      chords: droneChords(s),
      altChords: droneAltChords(s),
      velocity: s.drone.velocity,
      retriggerBars: s.drone.retriggerBars,
      rhythm: {
        mode: s.drone.rhythm,
        lengthPct: s.drone.rhythmLength,
        notes: s.drone.rhythmNotes,
        skip: s.drone.rhythmSkip,
        colorChance: s.drone.colorChance / 100,
        colorNotes: bassColorNotes(s, false),
        altColorNotes: bassColorNotes(s, true),
      },
    },
    pad: {
      enabled: s.solo ? s.solo === 'pad' : s.pad.enabled,
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
      swellOnBar: s.swellOnBar === true,
      entrance: { ...slotForEngine(s.transitions.entrance), on: s.transitions.entrance.on && s.transitionUse.entrance, level: s.transitions.entrance.level / 100, ...sampleOf(plan.entrance) },
      drumBreak: { ...slotForEngine(s.transitions.drumBreak), on: s.transitions.drumBreak.on && s.transitionUse.drumBreak, level: s.transitions.drumBreak.level / 100, ...sampleOf(plan.drumBreak) },
      drumReturn: { ...slotForEngine(s.transitions.drumReturn), on: s.transitions.drumReturn.on && s.transitionUse.drumReturn, level: s.transitions.drumReturn.level / 100, ...sampleOf(plan.drumReturn) },
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
        ...sampleOf(plan.recurring),
      },
    },
    tightTiming: s.tightTiming,
    harmony: { barsPerChord: s.harmony.barsPerChord, count: s.harmony.count },
    fill: {
      // Fills are drums: with the drum layer muted (or another part soloed) they stay silent too.
      enabled: s.fill.enabled && (s.solo ? s.solo === 'drums' : s.percussion),
      everyBars: s.fill.everyBars,
      beforeScene: s.fill.beforeScene,
      afterBreakdown: s.fill.afterBreakdown,
      density: s.fill.density / 100,
      chance: s.fill.chance / 100,
      maxBeats: s.fill.maxBeats,
      palette: fillPalette(s.drums),
    },
    ports: s.ports,
    outputs: s.outputs,
    keys: keysForEngine(s),
    dancer: (() => {
      const on = s.solo ? s.solo === 'dancer' : s.dancer.enabled;
      return {
        enabled: on,
        channel: s.dancer.channel,
        mode: s.dancer.mode,
        spaceMult: s.dancer.spaceMult,
        restBars: s.dancer.restBars,
        carryOn: s.dancer.carryOn,
        legato: s.dancer.legato,
        vibratoCents: s.dancer.vibratoDepth,
        vibratoHz: s.dancer.vibratoRate / 10,
        vibratoDelay: s.dancer.vibratoDelay / 1000,
        vibratoMode: s.dancer.vibratoMode,
        bendRange: s.dancer.bendRange,
        bendChance: s.dancer.bendChance / 100,
        scoopCents: s.dancer.scoop,
        scoopSec: s.dancer.scoopTime / 1000,
        fallCents: s.dancer.fall,
        fallSec: s.dancer.fallTime / 1000,
        dipCents: s.dancer.dip,
        dipChance: s.dancer.dipChance / 100,
        dipSec: s.dancer.dipTime / 1000,
        pick: s.dancer.pick,
        phrases: on ? makePhrases(s.dancer, s.harmony.mode, keyRoot(s)) : [],
      };
    })(),
    fade: {
      cc: s.fade.cc,
      droneIn: s.fade.droneIn / 10,
      droneOut: s.fade.droneOut / 10,
      padIn: s.fade.padIn / 10,
      padOut: s.fade.padOut / 10,
      drumIn: s.fade.drumIn / 10,
      drumOut: s.fade.drumOut / 10,
      drumsHard: s.fade.drumsHard,
    },
    wanderers: s.wanderers.map((w) => ({
      // Off with the filter movement switch, or while a preset owns this channel's filter.
      enabled: w.enabled && s.filterMove && !presetOwnsChannel(s, w.channel),
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
