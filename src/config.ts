import { buildPadChords } from './chords';
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

/** Looping chord pad built from the drone root + a mode (see src/chords.ts). */
export type PadState = {
  enabled: boolean;
  channel: number;
  velocity: number;
  humanize: number; // percent
  mode: number; // index into MODE_NAMES
  preset: number; // index into PRESETS (0 = custom)
  count: number; // chords in the loop, 1-4
  degrees: number[]; // 4 slots, scale degree 1-7 each; first `count` are used
  barsPerChord: number;
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

export type BedState = {
  bpm: number;
  swing: number; // percent 0-100
  midiOut: boolean;
  synthOut: boolean;
  drums: DrumState[];
  drone: DroneState;
  wanderers: WandererState[];
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
  drone: Pick<DroneState, 'enabled' | 'octave' | 'fifth' | 'velocity' | 'retriggerBars'>;
  pad: Omit<PadState, 'channel'>;
  drums: Omit<DrumState, 'name' | 'note' | 'channel'>[];
  wanderers: Pick<WandererState, 'enabled' | 'min' | 'max' | 'speed' | 'smooth'>[];
};

export const SCENE_COUNT = 4;

type SceneSource = Pick<BedState, 'swing' | 'drone' | 'pad' | 'drums' | 'wanderers'>;

export function captureScene(s: SceneSource): SceneData {
  const { channel: _padChannel, ...pad } = s.pad;
  return {
    swing: s.swing,
    drone: {
      enabled: s.drone.enabled,
      octave: s.drone.octave,
      fifth: s.drone.fifth,
      velocity: s.drone.velocity,
      retriggerBars: s.drone.retriggerBars,
    },
    pad: { ...pad, degrees: [...pad.degrees] },
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
  };
}

/** Overlay a scene onto the live settings, leaving everything global untouched. */
export function applyScene(s: BedState, sc: SceneData): BedState {
  return {
    ...s,
    swing: sc.swing,
    drone: { ...s.drone, ...sc.drone },
    pad: { ...s.pad, ...sc.pad, degrees: [...sc.pad.degrees] },
    drums: s.drums.map((d, i) => ({ ...d, ...sc.drums[i] })),
    wanderers: s.wanderers.map((w, i) => ({ ...w, ...sc.wanderers[i] })),
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
    mode: 1, // Dorian
    preset: 5, // Folk turn
    count: 4,
    degrees: [1, 7, 4, 7],
    barsPerChord: 2,
    style: 0,
    register: 55,
    spread: false,
    voiceLead: true,
    strumMs: 40,
  },
  sounds: [
    { name: 'Drone synth', channel: 0, program: 0, sendBank: false, bankMSB: 0, bankLSB: 0, favorites: '' },
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
      pad: { ...b.pad, preset: 1, count: 1, barsPerChord: 4 },
    }),
    captureScene({
      ...b,
      drums: b.drums.map((d) => (d.name === 'Kick' ? { ...d, hits: 5 } : d.name === 'Hat' ? { ...d, hits: 9 } : d)),
      pad: { ...b.pad, mode: 4, preset: 3, count: 2, degrees: [1, 4, 4, 7] },
    }),
    captureScene({
      ...b,
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

export function padChords(s: BedState): number[][] {
  return buildPadChords({
    root: s.drone.root,
    mode: s.pad.mode,
    degrees: s.pad.degrees,
    count: s.pad.count,
    style: s.pad.style,
    register: s.pad.register,
    spread: s.pad.spread,
    voiceLead: s.pad.voiceLead,
  });
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

export function migrateState(raw: unknown): BedState {
  const merged = mergeDefaults(defaultState, raw);
  const active = Math.max(0, Math.min(merged.scenes.length - 1, Math.round(merged.activeScene)));
  // The live settings ARE the active scene; keep the stored copy in step with them.
  return {
    ...merged,
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
    drums: s.drums.map((d) => ({
      enabled: d.enabled,
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
      notes: droneNotes(s.drone),
      velocity: s.drone.velocity,
      retriggerBars: s.drone.retriggerBars,
    },
    pad: {
      enabled: s.pad.enabled,
      channel: s.pad.channel,
      velocity: s.pad.velocity,
      humanize: s.pad.humanize / 100,
      barsPerChord: s.pad.barsPerChord,
      strumMs: s.pad.strumMs,
      chords: padChords(s),
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
      speed: w.speed / 100,
      smooth: w.smooth / 10,
    })),
  });
}
