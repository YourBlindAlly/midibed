import type { BeatPayload } from '../modules/midibed-engine/src/MidiBedEngine.types';

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
  applyConfig(json: string): void;
  addListener(name: 'onBeat', cb: (e: BeatPayload) => void): unknown;
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

export const engine = {
  start: () => native?.start(),
  stop: () => native?.stop(),
  applyConfig: (json: string) => native?.applyConfig(json),
};
