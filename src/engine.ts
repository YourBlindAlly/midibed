import type { BeatPayload, EndingPayload, MidiDevicePayload, MidiInPayload, MotionPayload, RecordingPayload, SceneEventPayload } from '../modules/midibed-engine/src/MidiBedEngine.types';

/**
 * Thin wrapper over the native module with a silent fallback so the UI still
 * loads in a browser or in Jest, where there is no native engine.
 *
 * `onBeat` registers ONE native listener for the app's lifetime and fans out to
 * a Set of subscribers, so components mounting/unmounting can never stack up
 * native listeners.
 */
type Native = {
  start(): void;
  stop(): void;
  panic(): void;
  playFill(): void;
  setDrumVoices(json: string): void;
  setPacks(json: string): void;
  setBassVoice(json: string): void;
  setFX(json: string): void;
  setKeysVoice(json: string): void;
  setPadVoice(json: string): void;
  setFilter(json: string): void;
  setOutputMode(mode: number): void;
  probeLoop(path: string): Promise<{ seconds: number; sampleRate: number; channels: number; peak: number; rms: number } | null>;
  requestEnd(json: string): void;
  reclaimKeyFocus(): void;
  applyConfig(json: string, queued: boolean): void;
  setScenes(json: string): void;
  sendControlChange(channel: number, cc: number, value: number, loops: boolean): void;
  setSynthLevel(channel: number, value: number): void;
  startRecording(): void;
  stopRecording(): void;
  midiDevices(): string[];
  setNetwork(json: string): void;
  sendReaperSignal(start: boolean): void;
  networkInfo(): { enabled: boolean; name: string; port: number; connections: number };
  sendNote(channel: number, note: number, velocity: number, durationMs: number): void;
  playTransitionNow(shape: number, color: number, beats: number, level: number): void;
  sendProgramChange(channel: number, program: number, bankMSB: number, bankLSB: number, loops: boolean): void;
  addListener(name: 'onBeat', cb: (e: BeatPayload) => void): unknown;
  addListener(name: 'onMotion', cb: (e: MotionPayload) => void): unknown;
  addListener(name: 'onScene', cb: (e: SceneEventPayload) => void): unknown;
  addListener(name: 'onMidiIn', cb: (e: MidiInPayload) => void): unknown;
  addListener(name: 'onEnding', cb: (e: EndingPayload) => void): unknown;
  addListener(name: 'onEnded', cb: (e: Record<string, never>) => void): unknown;
  addListener(name: 'onRecording', cb: (e: RecordingPayload) => void): unknown;
  addListener(name: 'onMidiDevice', cb: (e: MidiDevicePayload) => void): unknown;
};

let native: Native | null = null;
try {
  native = require('../modules/midibed-engine/src/MidiBedEngineModule').default as Native;
} catch {
  native = null;
}

export const hasNativeEngine = native !== null;

const beatSubscribers = new Set<(e: BeatPayload) => void>();
let beatHooked = false;

export function onBeat(cb: (e: BeatPayload) => void): () => void {
  if (native && !beatHooked) {
    beatHooked = true;
    native.addListener('onBeat', (e) => {
      beatSubscribers.forEach((fn) => fn(e));
    });
  }
  beatSubscribers.add(cb);
  return () => {
    beatSubscribers.delete(cb);
  };
}

const motionSubscribers = new Set<(e: MotionPayload) => void>();
let motionHooked = false;

/** Breathing rules changing something (or restarting with a scene). One native listener, fanned out. */
export function onMotion(cb: (e: MotionPayload) => void): () => void {
  if (native && !motionHooked) {
    motionHooked = true;
    native.addListener('onMotion', (e) => {
      motionSubscribers.forEach((fn) => fn(e));
    });
  }
  motionSubscribers.add(cb);
  return () => {
    motionSubscribers.delete(cb);
  };
}

const sceneSubscribers = new Set<(e: SceneEventPayload) => void>();
let sceneHooked = false;

/** Auto-advance news from the engine. One native listener, fanned out. */
export function onScene(cb: (e: SceneEventPayload) => void): () => void {
  if (native && !sceneHooked) {
    sceneHooked = true;
    native.addListener('onScene', (e) => {
      sceneSubscribers.forEach((fn) => fn(e));
    });
  }
  sceneSubscribers.add(cb);
  return () => {
    sceneSubscribers.delete(cb);
  };
}

const endingSubscribers = new Set<(e: EndingPayload) => void>();
const endedSubscribers = new Set<() => void>();
let endingHooked = false;

function hookEnding() {
  if (!native || endingHooked) return;
  endingHooked = true;
  native.addListener('onEnding', (e) => {
    endingSubscribers.forEach((fn) => fn(e));
  });
  native.addListener('onEnded', () => {
    endedSubscribers.forEach((fn) => fn());
  });
}

/** An orchestrated stop is waiting (bars left), or has just landed. One native listener, fanned out. */
export function onEnding(cb: (e: EndingPayload) => void): () => void {
  hookEnding();
  endingSubscribers.add(cb);
  return () => {
    endingSubscribers.delete(cb);
  };
}

/** The engine stopped by itself at the end of an orchestrated stop. */
export function onEnded(cb: () => void): () => void {
  hookEnding();
  endedSubscribers.add(cb);
  return () => {
    endedSubscribers.delete(cb);
  };
}

const recordingSubscribers = new Set<(e: RecordingPayload) => void>();
let recordingHooked = false;

/** A MIDI-file recording started, waited, stopped or was saved. One native listener, fanned out. */
export function onRecording(cb: (e: RecordingPayload) => void): () => void {
  if (native && !recordingHooked) {
    recordingHooked = true;
    native.addListener('onRecording', (e) => {
      recordingSubscribers.forEach((fn) => fn(e));
    });
  }
  recordingSubscribers.add(cb);
  return () => {
    recordingSubscribers.delete(cb);
  };
}

const deviceSubscribers = new Set<(e: MidiDevicePayload) => void>();
let deviceHooked = false;

/** A MIDI source (pedal, keyboard) connected or disconnected. One native listener, fanned out. */
export function onMidiDevice(cb: (e: MidiDevicePayload) => void): () => void {
  if (native && !deviceHooked) {
    deviceHooked = true;
    native.addListener('onMidiDevice', (e) => {
      deviceSubscribers.forEach((fn) => fn(e));
    });
  }
  deviceSubscribers.add(cb);
  return () => {
    deviceSubscribers.delete(cb);
  };
}

const midiInSubscribers = new Set<(e: MidiInPayload) => void>();
let midiInHooked = false;

/** Presses from a MIDI controller (pedal, keyboard). One native listener, fanned out. */
export function onMidiIn(cb: (e: MidiInPayload) => void): () => void {
  if (native && !midiInHooked) {
    midiInHooked = true;
    native.addListener('onMidiIn', (e) => {
      midiInSubscribers.forEach((fn) => fn(e));
    });
  }
  midiInSubscribers.add(cb);
  return () => {
    midiInSubscribers.delete(cb);
  };
}

export const engine = {
  /** All scenes as full configurations, so the engine can advance by itself. */
  setScenes: (json: string) => native?.setScenes(json),
  start: () => native?.start(),
  stop: () => native?.stop(),
  /** End every sounding note on every port (a stuck note). */
  panic: () => native?.panic(),
  /** A drum fill now (see src/fill.ts). */
  playFill: () => native?.playFill(),
  /** The built-in drum sounds (see src/drumvoice.ts). */
  setDrumVoices: (json: string) => native?.setDrumVoices(json),
  /** The sound-pack groups the drums use (src/packs.ts): file paths and loudness per group. Loaded in the background. */
  setPacks: (json: string) => native?.setPacks(json),
  /** The built-in bass voice on/off and its settings. */
  setBassVoice: (json: string) => native?.setBassVoice(json),
  setFX: (json: string) => native?.setFX(json),
  /** The Keys' electric piano type and sound controls (see src/keysvoice.ts). */
  setKeysVoice: (json: string) => native?.setKeysVoice(json),
  /** The chord pad's wave, detune, drift and flange (see src/padvoice.ts). */
  setPadVoice: (json: string) => native?.setPadVoice(json),
  /** The built-in sound's filter presets (see src/filters.ts). */
  setFilter: (json: string) => native?.setFilter(json),
  /** How the built-in sound leaves the phone (see src/outputmode.ts). */
  setOutputMode: (mode: number) => native?.setOutputMode(mode),
  /** Length of an audio file for the loop library (null if unreadable or no native engine). */
  probeLoop: (path: string) => (native ? native.probeLoop(path) : Promise.resolve(null)),
  /** An orchestrated stop (see src/ending.ts). */
  requestEnd: (json: string) => native?.requestEnd(json),
  /** Take keyboard focus back after a text field (otherwise shortcut keys stop arriving). */
  reclaimKeys: () => native?.reclaimKeyFocus(),
  /** The live link to a recording program: Network MIDI on or off, and the record and stop signals (src/network.ts). */
  setNetwork: (json: string) => native?.setNetwork(json),
  /** Send the record signal (true) or the stop signal (false) now. */
  sendReaperSignal: (start: boolean) => native?.sendReaperSignal(start),
  /** Is Network MIDI on, its name and port, and how many computers are connected. */
  networkInfo: () => native?.networkInfo() ?? null,
  /** The names of the MIDI sources (pedals, keyboards, other apps) that are connected now. */
  midiDevices: () => native?.midiDevices() ?? [],
  /** Record what the parts play as a MIDI file: starts on a bar line (or at Play, if stopped). */
  startRecording: () => native?.startRecording(),
  /** End the take; the file is saved and announced through onRecording. */
  stopRecording: () => native?.stopRecording(),
  /** queued = wait for the next bar line while playing (scene switches). */
  applyConfig: (json: string, queued = false) => native?.applyConfig(json, queued),
  /** loops = out the loops app's own port (when it has one). */
  sendControlChange: (channel: number, cc: number, value: number, loops = false) =>
    native?.sendControlChange(channel, cc, value, loops),
  /** A part's level for the built-in sound only (nothing goes out to other apps). */
  setSynthLevel: (channel: number, value: number) => native?.setSynthLevel(channel, value),
  /** One note, for auditioning which channel and note a receiving app answers to. */
  sendNote: (channel: number, note: number, velocity = 100, durationMs = 250) =>
    native?.sendNote(channel, note, velocity, durationMs),
  /** Hear a transition sound right now (for choosing settings). */
  playTransitionNow: (shape: number, color: number, beats: number, level: number) =>
    native?.playTransitionNow(shape, color, beats, level),
  /** bank values < 0 are skipped (no Bank Select sent). */
  sendProgramChange: (channel: number, program: number, bankMSB = -1, bankLSB = -1, loops = false) =>
    native?.sendProgramChange(channel, program, bankMSB, bankLSB, loops),
};

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Sends one smooth 0 -> 127 -> 0 sweep of a single CC, for MIDI-learn in the
 * receiving app. Timing here is deliberately loose (JS timer): it is not musical.
 */
export function testSweep(channel: number, cc: number, durationMs = 3000): void {
  if (sweepTimer) clearInterval(sweepTimer);
  const stepMs = 40;
  const total = Math.max(2, Math.round(durationMs / stepMs));
  let i = 0;
  sweepTimer = setInterval(() => {
    const v = Math.round((127 * (1 - Math.cos((2 * Math.PI * i) / total))) / 2);
    engine.sendControlChange(channel, cc, v);
    i += 1;
    if (i > total) {
      if (sweepTimer) clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, stepMs);
}
