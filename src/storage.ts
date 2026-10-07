import AsyncStorage from '@react-native-async-storage/async-storage';
import { BedState, defaultState, migrateState } from './config';

const KEY = 'midibed.state.v1';

export async function loadState(): Promise<BedState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultState;
    return migrateState(JSON.parse(raw));
  } catch {
    return defaultState;
  }
}

export async function saveState(state: BedState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Saving is a convenience; never let it break playing.
  }
}
