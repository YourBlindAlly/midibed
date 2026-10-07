import { buildPadChords } from './chords';

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
  program: number; // 0-127 (shown as 1-128)
  sendBank: boolean;
  bankMSB: number; // CC 0
  bankLSB: number; // CC 32
};

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
  restrikeBeats: number; // 0 = hold
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
  sounds: SoundSlot[];
};

export const defaultState: BedState = {
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
  ],
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
    restrikeBeats: 0,
  },
  sounds: [
    { name: 'Drone synth', channel: 0, program: 0, sendBank: false, bankMSB: 0, bankLSB: 0 },
    { name: 'Percussion', channel: 9, program: 0, sendBank: false, bankMSB: 0, bankLSB: 0 },
  ],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note number to a name, using the C4 = 60 convention. */
export function noteName(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

/** General MIDI percussion map (GM2 range 27-87 where names are agreed). */
const GM_DRUMS: Record<number, string> = {
  35: 'Acoustic bass drum',
  36: 'Bass drum',
  37: 'Side stick',
  38: 'Acoustic snare',
  39: 'Hand clap',
  40: 'Electric snare',
  41: 'Low floor tom',
  42: 'Closed hi-hat',
  43: 'High floor tom',
  44: 'Pedal hi-hat',
  45: 'Low tom',
  46: 'Open hi-hat',
  47: 'Low-mid tom',
  48: 'Hi-mid tom',
  49: 'Crash cymbal',
  50: 'High tom',
  51: 'Ride cymbal',
  52: 'Chinese cymbal',
  53: 'Ride bell',
  54: 'Tambourine',
  55: 'Splash cymbal',
  56: 'Cowbell',
  57: 'Crash cymbal 2',
  58: 'Vibraslap',
  59: 'Ride cymbal 2',
  60: 'Hi bongo',
  61: 'Low bongo',
  62: 'Mute hi conga',
  63: 'Open hi conga',
  64: 'Low conga',
  65: 'High timbale',
  66: 'Low timbale',
  67: 'High agogo',
  68: 'Low agogo',
  69: 'Cabasa',
  70: 'Maracas',
  71: 'Short whistle',
  72: 'Long whistle',
  73: 'Short guiro',
  74: 'Long guiro',
  75: 'Claves',
  76: 'Hi wood block',
  77: 'Low wood block',
  78: 'Mute cuica',
  79: 'Open cuica',
  80: 'Mute triangle',
  81: 'Open triangle',
  82: 'Shaker',
  83: 'Jingle bell',
  84: 'Bell tree',
  85: 'Castanets',
  86: 'Mute surdo',
  87: 'Open surdo',
};

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
  return mergeDefaults(defaultState, raw);
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
      restrikeBeats: s.pad.restrikeBeats,
      chords: padChords(s),
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
