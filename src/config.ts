import { buildBassChords, buildPadChords } from './chords';
import { MotionState, defaultMotion, drumRole } from './motion';
import { TransitionsState, defaultTransitions } from './transitions';
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
  speed: number; // percent of range per second
  smooth: number; // tenths of a second
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
  bpm: number;
  swing: number; // percent 0-100
  midiOut: boolean;
  synthOut: boolean;
  /** Send MIDI clock plus Start/Stop while playing, so other apps can follow the tempo. */
  clock: boolean;
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
  /** Transition sounds per scene (how it starts, how the drums return). */
  transitions: TransitionsState;
  /** A lead-in needs at least this many eighth notes before the change, or only its downer plays on the beat. */
  transitionMinEighths: number;
  pad: PadState;
  fade: FadeState;
  sounds: SoundSlot[];
  /** Which known app each role talks to (names and shortcuts only; see profiles.ts). */
  profiles: ProfileChoice;
  activeScene: number;
  scenes: SceneData[];
};

/**
 * What a scene remembers. Deliberately NOT in a scene: tempo, the drone root,
 * outputs, fades, program sounds, and all routing (MIDI channels, CC numbers,
 * drum note numbers), so switching scenes never changes the key, speed or wiring.
 */
export type SceneData = {
  swing: number;
  percussion: boolean;
  drone: Pick<DroneState, 'enabled' | 'octave' | 'fifth' | 'velocity' | 'retriggerBars' | 'follow'>;
  harmony: HarmonyState;
  motion: MotionState;
  transitions: TransitionsState;
  pad: Omit<PadState, 'channel'>;
  drums: Omit<DrumState, 'name' | 'note' | 'channel'>[];
  wanderers: Pick<WandererState, 'enabled' | 'min' | 'max' | 'speed' | 'smooth'>[];
  loops: Pick<LoopsState, 'enabled' | 'program' | 'sendBank' | 'bankMSB' | 'bankLSB'>;
};

export const SCENE_COUNT = 4;

type SceneSource = Pick<BedState, 'swing' | 'percussion' | 'drone' | 'harmony' | 'motion' | 'transitions' | 'pad' | 'drums' | 'wanderers' | 'loops'>;

export function captureScene(s: SceneSource): SceneData {
  const { channel: _padChannel, ...pad } = s.pad;
  return {
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
    transitions: { entrance: { ...s.transitions.entrance }, drumReturn: { ...s.transitions.drumReturn } },
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
    wanderers: s.wanderers.map((w) => ({ enabled: w.enabled, min: w.min, max: w.max, speed: w.speed, smooth: w.smooth })),
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
    swing: sc.swing,
    percussion: sc.percussion,
    drone: { ...s.drone, ...sc.drone },
    harmony: { ...sc.harmony, degrees: [...sc.harmony.degrees] },
    motion: { preset: sc.motion.preset, bass: { ...sc.motion.bass }, pad: { ...sc.motion.pad }, drums: { ...sc.motion.drums } },
    transitions: { entrance: { ...sc.transitions.entrance }, drumReturn: { ...sc.transitions.drumReturn } },
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

const baseState: Omit<BedState, 'scenes' | 'activeScene'> = {
  profiles: defaultProfileChoice,
  bpm: 88,
  swing: 15,
  midiOut: true,
  synthOut: true,
  clock: false,
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
    { name: 'Cutoff', enabled: true, cc: 74, channel: 0, min: 15, max: 105, speed: 4, smooth: 30 },
    { name: 'Resonance', enabled: true, cc: 71, channel: 0, min: 25, max: 85, speed: 3, smooth: 40 },
    // Off by default. Moves the drum filter on channel 10 (index 9).
    { name: 'Drum cutoff', enabled: false, cc: 74, channel: 9, min: 40, max: 127, speed: 4, smooth: 30 },
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

export const defaultState: BedState = { ...baseState, activeScene: 0, scenes: startingScenes() };

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
    root: s.drone.root,
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
    root: s.drone.root,
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

export function migrateState(rawInput: unknown): BedState {
  const lifted = markCustomMotion(liftHarmony(rawInput));
  const raw =
    lifted !== null && typeof lifted === 'object' && Array.isArray((lifted as Record<string, unknown>).scenes)
      ? {
          ...(lifted as Record<string, unknown>),
          scenes: ((lifted as Record<string, unknown>).scenes as unknown[]).map((sc) => markCustomMotion(liftHarmony(sc))),
        }
      : lifted;
  const merged = mergeDefaults(defaultState, raw);
  const active = Math.max(0, Math.min(merged.scenes.length - 1, Math.round(merged.activeScene)));
  // The live settings ARE the active scene; keep the stored copy in step with them.
  // Names are labels, not user data: always take the current ones, so a rename
  // (e.g. 'Drone synth' -> 'Bass drone') reaches settings saved by older versions.
  const sounds = merged.sounds.map((sl, i) => ({ ...sl, name: defaultState.sounds[i]?.name ?? sl.name }));
  return {
    ...merged,
    sounds,
    activeScene: active,
    scenes: merged.scenes.map((sc, i) => (i === active ? captureScene(merged) : sc)),
  };
}

/** Shape the native engine expects (MidiBedConfig in MidiBedEngine.swift). */
export function toEngineJson(s: BedState): string {
  return JSON.stringify({
    bpm: s.bpm,
    swing: s.swing / 100,
    midiOut: s.midiOut,
    synthOut: s.synthOut,
    clock: s.clock,
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
      entrance: { ...s.transitions.entrance, level: s.transitions.entrance.level / 100 },
      drumReturn: { ...s.transitions.drumReturn, level: s.transitions.drumReturn.level / 100 },
    },
    harmony: { barsPerChord: s.harmony.barsPerChord, count: s.harmony.count },
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
      speed: w.speed / 100,
      smooth: w.smooth / 10,
    })),
  });
}
