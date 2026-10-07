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

export type BedState = {
  bpm: number;
  swing: number; // percent 0-100
  midiOut: boolean;
  synthOut: boolean;
  drums: DrumState[];
  drone: DroneState;
  wanderers: WandererState[];
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
    { name: 'Shaker', enabled: true, note: 39, channel: 9, steps: 5, hits: 3, rotation: 0, velocity: 60, probability: 80, humanize: 40 },
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
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note number to a name, using the C4 = 60 convention. */
export function noteName(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

export function droneNotes(d: DroneState): number[] {
  const notes = [d.root];
  if (d.octave) notes.push(d.root + 12);
  if (d.fifth) notes.push(d.root + 7);
  return notes;
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
