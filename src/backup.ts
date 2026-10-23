// A backup of all the settings (journeys, scenes, favourites, routing, pedal mapping and the rest) as one text file,
// so they can be carried to another install of the app: a signed build of MidiBed is a different app to the phone
// from one installed with iLoader, and does not see its saved settings. The imported loops are not inside the file
// (they are audio, in the app's Documents/loops folder); a restore keeps the library entries whose files are there.

import { BedState, migrateState } from './config';
import { parseLibrary } from './looplib';

export const BACKUP_FILE_NAME = 'MidiBed settings backup.json';

/** The text to save. */
export function backupText(state: BedState, savedAt = new Date()): string {
  return JSON.stringify({ app: 'MidiBed', backup: 1, savedAt: savedAt.toISOString(), state }, null, 1);
}

/**
 * The settings in a backup, brought up to date (anything this version added gets its default), or null if the text
 * is not a MidiBed backup. A bare settings object is accepted too.
 */
export function parseBackup(text: string): BedState | null {
  try {
    const raw = JSON.parse(text);
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const inner = raw.app === 'MidiBed' && raw.state && typeof raw.state === 'object' ? raw.state : raw.app === undefined && raw.scenes ? raw : null;
    if (!inner) return null;
    return migrateState(inner);
  } catch {
    return null;
  }
}

/**
 * Keep only the loop-library entries whose audio file is on this phone (`has(file)`), so a restored library never
 * lists a loop that cannot play. Returns the settings and how many entries there were and are left.
 */
export function keepFoundLoops(state: BedState, has: (file: string) => boolean): { state: BedState; before: number; after: number } {
  const lib = parseLibrary(state.loopLib);
  const kept = lib.filter((l) => has(l.file));
  return { state: { ...state, loopLib: JSON.stringify(kept) }, before: lib.length, after: kept.length };
}
