import { NativeModule, requireNativeModule } from 'expo';
import type { MidiBedEngineEvents } from './MidiBedEngine.types';

declare class MidiBedEngineModule extends NativeModule<MidiBedEngineEvents> {
  start(): void;
  stop(): void;
  /** Whole settings object as a JSON string; see MidiBedConfig in MidiBedEngine.swift. */
  applyConfig(json: string, queued: boolean): void;
  sendControlChange(channel: number, cc: number, value: number): void;
  sendNote(channel: number, note: number, velocity: number, durationMs: number): void;
  playTransitionNow(shape: number, color: number, beats: number, level: number): void;
  /** bank values < 0 are skipped. */
  sendProgramChange(channel: number, program: number, bankMSB: number, bankLSB: number): void;
  getStatus(): { running: boolean; tick: number };
}

export default requireNativeModule<MidiBedEngineModule>('MidiBedEngine');
