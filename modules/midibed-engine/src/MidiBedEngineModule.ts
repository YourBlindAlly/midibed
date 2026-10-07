import { NativeModule, requireNativeModule } from 'expo';
import type { MidiBedEngineEvents } from './MidiBedEngine.types';

declare class MidiBedEngineModule extends NativeModule<MidiBedEngineEvents> {
  start(): void;
  stop(): void;
  /** Whole settings object as a JSON string; see MidiBedConfig in MidiBedEngine.swift. */
  applyConfig(json: string): void;
  getStatus(): { running: boolean; tick: number };
}

export default requireNativeModule<MidiBedEngineModule>('MidiBedEngine');
