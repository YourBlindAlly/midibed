import type { BeatPayload, MotionPayload, SceneEventPayload } from '../modules/midibed-engine/src/MidiBedEngine.types';

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
  applyConfig(json: string, queued: boolean): void;
  setScenes(json: string): void;
  sendControlChange(channel: number, cc: number, value: number, loops: boolean): void;
  sendNote(channel: number, note: number, velocity: number, durationMs: number): void;
  playTransitionNow(shape: number, color: number, beats: number, level: number): void;
  sendProgramChange(channel: number, program: number, bankMSB: number, bankLSB: number, loops: boolean): void;
  addListener(name: 'onBeat', cb: (e: BeatPayload) => void): unknown;
  addListener(name: 'onMotion', cb: (e: MotionPayload) => void): unknown;
  addListener(name: 'onScene', cb: (e: SceneEventPayload) => void): unknown;
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

export const engine = {
  /** All scenes as full configurations, so the engine can advance by itself. */
  setScenes: (json: string) => native?.setScenes(json),
  start: () => native?.start(),
  stop: () => native?.stop(),
  /** End every sounding note on every port (a stuck note). */
  panic: () => native?.panic(),
  /** queued = wait for the next bar line while playing (scene switches). */
  applyConfig: (json: string, queued = false) => native?.applyConfig(json, queued),
  /** loops = out the loops app's own port (when it has one). */
  sendControlChange: (channel: number, cc: number, value: number, loops = false) =>
    native?.sendControlChange(channel, cc, value, loops),
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
