import { NativeModule, requireNativeModule } from 'expo';
import type { MidiBedEngineEvents } from './MidiBedEngine.types';

declare class MidiBedEngineModule extends NativeModule<MidiBedEngineEvents> {
  start(): void;
  stop(): void;
  /** End every sounding note on every port. */
  panic(): void;
  /** Play a drum fill at the next opportunity (the last beats of this bar, or the next). */
  playFill(): void;
  /** The built-in drum sounds: JSON [{note, channel, type, tune, decay, tone, snap, level}]. */
  setDrumVoices(json: string): void;
  /** The built-in bass voice: JSON {enabled, exclusive, values[]} (see src/bassvoice.ts). */
  setBassVoice(json: string): void;
  /** The built-in effects: JSON {values[]} in the order of UglyFXParam (see src/uglyfx.ts). */
  setFX(json: string): void;
  /** An orchestrated stop: JSON {style 1 bar|2 progression|3 scene, fadeBars, finalHit, noise, noiseShape, noiseLevel}. */
  requestEnd(json: string): void;
  reclaimKeyFocus(): void;
  /** Whole settings object as a JSON string; see MidiBedConfig in MidiBedEngine.swift. */
  applyConfig(json: string, queued: boolean): void;
  /** Every scene as a full configuration (JSON array), for auto-advance. */
  setScenes(json: string): void;
  sendControlChange(channel: number, cc: number, value: number, loops: boolean): void;
  sendNote(channel: number, note: number, velocity: number, durationMs: number): void;
  playTransitionNow(shape: number, color: number, beats: number, level: number): void;
  /** bank values < 0 are skipped. */
  sendProgramChange(channel: number, program: number, bankMSB: number, bankLSB: number, loops: boolean): void;
  getStatus(): { running: boolean; tick: number };
}

export default requireNativeModule<MidiBedEngineModule>('MidiBedEngine');
