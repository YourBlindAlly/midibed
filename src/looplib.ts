/**
 * The loop player's library and lanes (native: ios/LoopPlayer.swift, scheduling in MidiBedEngine.swift).
 *
 * The library is the list of audio files MidiBed has copied into its own storage (global, saved as JSON text).
 * A lane holds one library loop, how many bars it spans, its level and balance, and whether it plays; the
 * four lanes are saved per scene. The engine plays a lane from a bar line and restarts it every `bars` bars,
 * at exactly the speed that makes the file fill those bars at the journey's tempo.
 *
 * A file is never committed anywhere: loops live only in the app's own storage on the phone.
 */
export const LANE_COUNT = 4;

export type LibraryLoop = {
  id: string;
  name: string;
  /** The folder the loop came from (its set or instrument folder). */
  folder: string;
  /** The file name inside the app's loops folder. */
  file: string;
  seconds: number;
  /** Tempo read from the name, or null. */
  bpm: number | null;
  /** Whole bars the file spans (at least 1). */
  bars: number;
  /** A file shorter than a bar plays this many times in a bar. */
  repeats: number;
  /** Loudness measured when it was added: the highest sample and the RMS (0-1). Missing in older entries. */
  peak?: number;
  rms?: number;
};

export type LaneState = {
  /** A library loop id, or '' for an empty lane. */
  loop: string;
  on: boolean;
  /** percent */
  level: number;
  /** -100 (left) ... 100 (right) */
  pan: number;
  /** 0 = what the library says, else 1-16 bars */
  bars: number;
};

export const defaultLane: LaneState = { loop: '', on: false, level: 100, pan: 0, bars: 0 };
export const defaultLanes = (): LaneState[] => Array.from({ length: LANE_COUNT }, () => ({ ...defaultLane }));
export const BAR_CHOICES = [0, 1, 2, 4, 8, 16];

const AUDIO = /\.(wav|wave|aif|aiff|caf|mp3|m4a|flac)$/i;
export function isAudioFile(name: string): boolean {
  return AUDIO.test(name) && !name.startsWith('.') && !name.startsWith('._');
}

/** Tempo from a loop's name: '90bpm', '068 BPM', or a trailing number like 'PL_Conga_138_01.wav'. */
export function tempoFromName(name: string): number | null {
  const explicit = /(\d{2,3})\s*bpm/i.exec(name);
  if (explicit) {
    const n = Number(explicit[1]);
    return n >= 40 && n <= 220 ? n : null;
  }
  const trailing = /_(\d{2,3})(?:_\d+)?\.[A-Za-z0-9]+$/.exec(name);
  if (trailing) {
    const n = Number(trailing[1]);
    return n >= 40 && n <= 220 ? n : null;
  }
  return null;
}

/**
 * How many whole bars (4/4) a file spans, from its length and tempo; a file shorter than a bar plays
 * several times in one bar. Without a tempo the file is assumed to be 4 bars.
 */
export function barsFromLength(seconds: number, bpm: number | null): { bars: number; repeats: number } {
  if (!bpm || seconds <= 0) return { bars: 4, repeats: 1 };
  const beats = (seconds * bpm) / 60;
  if (beats >= 3.5) return { bars: Math.max(1, Math.round(beats / 4)), repeats: 1 };
  const repeats = Math.max(1, Math.round(4 / Math.max(0.5, beats)));
  return { bars: 1, repeats };
}

let cacheKey = '';
let cacheValue: LibraryLoop[] = [];

export function parseLibrary(json: string): LibraryLoop[] {
  if (json === cacheKey) return cacheValue;
  let out: LibraryLoop[] = [];
  try {
    const raw = JSON.parse(json);
    if (Array.isArray(raw)) {
      out = raw
        .filter((e) => e && typeof e.id === 'string' && typeof e.file === 'string')
        .map((e) => ({
          id: String(e.id),
          name: String(e.name ?? e.file),
          folder: String(e.folder ?? ''),
          file: String(e.file),
          seconds: Number(e.seconds) || 0,
          bpm: typeof e.bpm === 'number' ? e.bpm : null,
          bars: Math.max(1, Math.round(Number(e.bars) || 4)),
          repeats: Math.max(1, Math.round(Number(e.repeats) || 1)),
          peak: Number(e.peak) > 0 ? Number(e.peak) : undefined,
          rms: Number(e.rms) > 0 ? Number(e.rms) : undefined,
        }));
    }
  } catch {
    out = [];
  }
  cacheKey = json;
  cacheValue = out;
  return out;
}

export function addToLibrary(json: string, entries: LibraryLoop[]): string {
  const map = new Map(parseLibrary(json).map((e) => [e.id, e]));
  for (const e of entries) map.set(e.id, e);
  const list = Array.from(map.values()).sort((a, b) => (a.folder + '/' + a.name).localeCompare(b.folder + '/' + b.name));
  return JSON.stringify(list);
}

export function folderNames(lib: LibraryLoop[]): string[] {
  return Array.from(new Set(lib.map((l) => l.folder))).sort((a, b) => a.localeCompare(b));
}

/** The app's loops folder, set once at start (a file:// URI ending in a slash). */
let loopDir = '';
export function setLoopDir(uri: string) {
  loopDir = uri ? (uri.endsWith('/') ? uri : uri + '/') : '';
}
export function getLoopDir(): string {
  return loopDir;
}

/** The plain path of a library file, for the native player. */
export function loopPath(file: string): string {
  if (!loopDir) return '';
  let base = loopDir.replace(/^file:\/\//, '');
  try {
    base = decodeURI(base);
  } catch {
    // keep as it is
  }
  return base + file;
}

/**
 * Loudness matching. Loops are usually peak-normalized (every file's loudest hit at the same level), which
 * is far hotter than MidiBed's own parts and very different from file to file. A loop's match gain aims its
 * average loudness (RMS) at about -28 dBFS, and never lets its loudest hit pass about -10.5 dBFS. A lane at
 * 100 percent is therefore "at the level of the bed". A file with no measurement gets a flat -10 dB.
 */
export const MATCH_TARGET_RMS = 0.04;
export const MATCH_PEAK_CAP = 0.3;
export const MATCH_FALLBACK = 0.3;

export function matchGain(peak?: number, rms?: number): number {
  if (!(peak && peak > 0) || !(rms && rms > 0)) return MATCH_FALLBACK;
  const g = Math.min(MATCH_TARGET_RMS / rms, MATCH_PEAK_CAP / peak);
  return Math.max(0.02, Math.min(4, g));
}

/** The lanes as the engine takes them. `master` is the Loop player level in percent. */
export function lanesForEngine(
  lanes: LaneState[],
  libJson: string,
  master = 100,
): { path: string; bars: number; repeats: number; level: number; pan: number; on: boolean }[] {
  const lib = parseLibrary(libJson);
  return Array.from({ length: LANE_COUNT }, (_, i) => {
    const lane = lanes[i] ?? defaultLane;
    const loop = lib.find((l) => l.id === lane.loop);
    const path = loop ? loopPath(loop.file) : '';
    const bars = lane.bars > 0 ? lane.bars : loop ? loop.bars : 4;
    const repeats = lane.bars > 0 ? 1 : loop ? loop.repeats : 1;
    const gain = loop ? matchGain(loop.peak, loop.rms) : 1;
    const level = (Math.max(0, Math.min(150, lane.level)) / 100) * (Math.max(0, Math.min(150, master)) / 100) * gain;
    return { path, bars, repeats, level, pan: Math.max(-100, Math.min(100, lane.pan)) / 100, on: lane.on && path !== '' };
  });
}

export function laneSummary(lane: LaneState, lib: LibraryLoop[], index: number): string {
  const loop = lib.find((l) => l.id === lane.loop);
  return `Lane ${index + 1}: ${loop ? `${loop.name}, ${lane.on ? 'playing' : 'off'}` : 'empty'}`;
}
