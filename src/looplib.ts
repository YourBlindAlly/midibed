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
  /** -1 = best fit (whole, half or double the bars, whichever needs the smallest speed change), 0 = what the file's name and length say, else 1-16 bars */
  bars: number;
  /** true = the pitch follows the tempo (a plain speed change); false = the pitch stays where it is and the loop is time-stretched to fit */
  follow: boolean;
  /** pitch shift in whole semitones, -12 ... 12 (a shifted loop is time-stretched so it still fills its bars) */
  semis: number;
  /** Breathing: 0 plays steadily, 1 its own cycle, 2 only with the drums, 3 only when the drums are out (see lanebreath.ts). */
  breathe: number;
  /** Cycle: bars playing, bars resting, and the chance (percent) that it rests when its turn comes. */
  breatheOn: number;
  breatheOff: number;
  breatheChance: number;
};

export const defaultLane: LaneState = { loop: '', on: false, level: 100, pan: 0, bars: -1, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
export const SEMI_RANGE = 12;
export const defaultLanes = (): LaneState[] => Array.from({ length: LANE_COUNT }, () => ({ ...defaultLane }));
export const BAR_CHOICES = [-1, 0, 1, 2, 4, 8, 16];

const AUDIO = /\.(wav|wave|aif|aiff|caf|mp3|m4a|flac)$/i;
export function isAudioFile(name: string): boolean {
  return AUDIO.test(name) && !name.startsWith('.') && !name.startsWith('._');
}

/**
 * Tempo from a loop's name: '90bpm' or '068 BPM' first; otherwise the right-most whole number of two or three
 * digits between 40 and 220 that stands on its own between _, - or spaces ('PL_Conga_138_01' is 138, because
 * 01 is too small to be a tempo; 'Darabouka_01_126' is 126; 'Taikobongos_70_Bigtoms' is 70).
 */
export function tempoFromName(name: string): number | null {
  const explicit = /(\d{2,3})\s*bpm/i.exec(name);
  if (explicit) {
    const n = Number(explicit[1]);
    return n >= 40 && n <= 220 ? n : null;
  }
  const stem = name.replace(/\.[A-Za-z0-9]+$/, '');
  const tokens = stem.split(/[_\-\s]+/).filter((tok) => /^\d{2,3}$/.test(tok));
  for (let i = tokens.length - 1; i >= 0; i--) {
    const n = Number(tokens[i]);
    if (n >= 40 && n <= 220) return n;
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

/** With the pitch kept, a loop is stretched rather than cut while it needs between 0.62 and 1.6 times its speed. */
export const KEEP_PITCH_MIN = 0.62;
export const KEEP_PITCH_MAX = 1.6;

/**
 * Best fit: of the loop's own length, half of it and double it (and, for a loop shorter than a bar, more or
 * fewer repeats in the bar), the one that needs the smallest speed change to fill its bars at the journey
 * tempo. A 170 BPM loop at 88 BPM comes out as half the bars; a 90 BPM loop stays as it is. A loop with no
 * known tempo keeps the length the library worked out.
 */
export function bestFit(loop: Pick<LibraryLoop, 'seconds' | 'bpm' | 'bars' | 'repeats'>, journeyBpm: number, keepPitch = false): { bars: number; repeats: number; speed: number } {
  const own = { bars: loop.bars, repeats: loop.repeats };
  const speedFor = (bars: number, repeats: number) => (loop.seconds * repeats) / ((bars * 4 * 60) / Math.max(30, journeyBpm));
  if (!loop.bpm || loop.seconds <= 0 || journeyBpm <= 0) return { ...own, speed: speedFor(own.bars, own.repeats) };
  // Stretching keeps the pitch, so the whole loop is kept (not cut in half) while it only needs a moderate stretch.
  if (keepPitch) {
    const s = speedFor(own.bars, own.repeats);
    if (s >= KEEP_PITCH_MIN && s <= KEEP_PITCH_MAX) return { ...own, speed: s };
  }
  const options: { bars: number; repeats: number }[] = [own, { bars: own.bars * 2, repeats: own.repeats }];
  if (own.bars >= 2 && own.bars % 2 === 0) options.push({ bars: own.bars / 2, repeats: own.repeats });
  if (own.bars === 1) options.push({ bars: 1, repeats: own.repeats * 2 });
  if (own.bars === 1 && own.repeats > 1 && own.repeats % 2 === 0) options.push({ bars: 1, repeats: own.repeats / 2 });
  let best = options[0];
  let bestCost = Math.abs(Math.log2(speedFor(best.bars, best.repeats)));
  for (const o of options.slice(1)) {
    const cost = Math.abs(Math.log2(speedFor(o.bars, o.repeats)));
    // The smaller speed change wins; if two need the same, the shorter (fewer bars, then fewer repeats) wins.
    const better = cost < bestCost - 1e-6 || (Math.abs(cost - bestCost) <= 1e-6 && (o.bars < best.bars || (o.bars === best.bars && o.repeats < best.repeats)));
    if (better) {
      best = o;
      bestCost = Math.min(cost, bestCost);
    }
  }
  return { ...best, speed: speedFor(best.bars, best.repeats) };
}

/**
 * The library id for a wanted loop id. A lane (a starter journey's, or one saved before the loops were moved
 * to another folder) may name a loop as 'Some folder/File name.flac'; if the library has no loop with exactly
 * that id but has exactly one with the same file name in another folder, that one is used. Otherwise the id
 * is returned unchanged (the lane stays quiet until the loop is imported).
 */
export function resolveLoopId(lib: LibraryLoop[], id: string): string {
  if (!id || lib.some((l) => l.id === id)) return id;
  const file = id.slice(id.lastIndexOf('/') + 1).toLowerCase();
  const same = lib.filter((l) => l.id.slice(l.id.lastIndexOf('/') + 1).toLowerCase() === file);
  return same.length === 1 ? same[0].id : id;
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

/** The tempo filter's choices: how close to the journey tempo a loop's own tempo must be. */
export const NEAR_NAMES = ['Any tempo', 'Within 3 BPM of the tempo', 'Within 6 BPM of the tempo', 'Within 10 BPM of the tempo'];
export const NEAR_BPM = [0, 3, 6, 10];

// Which instrument a loop is, worked out from its name (the part after ' - ' first, then the whole name, then
// its folder). The first rule that matches wins, so the more specific ones come first. 'Other' is last.
const INSTRUMENT_RULES: [string, RegExp][] = [
  ['Tambourine', /tamb|panderio|pandeiro|riq\b/i],
  ['Shaker', /shak|maraca|canister|caxixi|seed|nuts n bolts|cabasa/i],
  ['Guiro', /guiro/i],
  ['Tabla', /tabla/i],
  ['Bongos', /bongo/i],
  ['Congas', /conga/i],
  ['Djembe', /djembe/i],
  ['Cajon', /cajun|cajon/i],
  ['Udu', /\budu/i],
  ['Kanjira', /kanjira/i],
  ['Dumbek', /dumbek|darabou|doumbek/i],
  ['Ghatam', /ghatam/i],
  ['Dhol', /dhol|davul/i],
  ['Taiko', /taiko/i],
  ['Talking drum', /talking/i],
  ['Frame drum', /frame/i],
  ['Toms', /toms?(\b|_)/i],
  ['Low drums', /subkick|lowdrum|lowdrive|sub ?bass/i],
  ['Triangle', /triangle/i],
  ['Bells and cymbals', /agogo|bell|cymb|\bzil/i],
  ['Castanets', /castanet/i],
  ['Whistle', /whistle/i],
  ['Effects', /swish|efx|timeless/i],
];

export function instrumentOf(name: string, folder = ''): string {
  const stem = name.includes(' - ') ? name.slice(name.lastIndexOf(' - ') + 3) : '';
  for (const text of [stem, name, folder]) {
    if (!text) continue;
    for (const [instrument, re] of INSTRUMENT_RULES) if (re.test(text)) return instrument;
  }
  return 'Other';
}

/** The instruments found in the library, alphabetical, with 'Other' last. */
export function instrumentList(lib: LibraryLoop[]): string[] {
  const found = new Set(lib.map((l) => instrumentOf(l.name, l.folder)));
  const named = Array.from(found).filter((n) => n !== 'Other').sort();
  return found.has('Other') ? [...named, 'Other'] : named;
}

export type LoopFilter = {
  /** '' = every folder. */
  folder: string;
  /** index into NEAR_NAMES (0 = any tempo) */
  near: number;
  /** the journey tempo the filter measures from */
  bpm: number;
  /** words that must all appear in the loop's name or folder (any case); '' = no filter */
  text: string;
  /** an instrument from instrumentList (see instrumentOf); '' or left out = any */
  instrument?: string;
};

/**
 * The loops that pass the lane browser's filters: in the chosen folder (or all), within a few BPM of the
 * tempo (a loop with no known tempo is left out while that filter is on), and containing every typed word.
 */
export function filterLoops(lib: LibraryLoop[], f: LoopFilter): LibraryLoop[] {
  const range = NEAR_BPM[Math.max(0, Math.min(NEAR_BPM.length - 1, Math.round(f.near)))];
  const words = f.text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return lib.filter((l) => {
    if (f.folder && l.folder !== f.folder) return false;
    if (f.instrument && instrumentOf(l.name, l.folder) !== f.instrument) return false;
    if (range > 0 && (l.bpm === null || Math.abs(l.bpm - f.bpm) > range)) return false;
    if (words.length > 0) {
      const hay = `${l.name} ${l.folder}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
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
  journeyBpm = 0,
): { path: string; bars: number; repeats: number; level: number; pan: number; on: boolean; follow: boolean; semis: number; breathe: { mode: number; onBars: number; offBars: number; chance: number } }[] {
  const lib = parseLibrary(libJson);
  return Array.from({ length: LANE_COUNT }, (_, i) => {
    const lane = lanes[i] ?? defaultLane;
    const loop = lib.find((l) => l.id === lane.loop);
    const path = loop ? loopPath(loop.file) : '';
    const fit = loop && lane.bars < 0 && journeyBpm > 0 ? bestFit(loop, journeyBpm, lane.follow === false) : null;
    const bars = lane.bars > 0 ? lane.bars : fit ? fit.bars : loop ? loop.bars : 4;
    const repeats = lane.bars > 0 ? 1 : fit ? fit.repeats : loop ? loop.repeats : 1;
    const gain = loop ? matchGain(loop.peak, loop.rms) : 1;
    const level = (Math.max(0, Math.min(150, lane.level)) / 100) * (Math.max(0, Math.min(150, master)) / 100) * gain;
    return { path, bars, repeats, level, pan: Math.max(-100, Math.min(100, lane.pan)) / 100, on: lane.on && path !== '', follow: lane.follow !== false,
      semis: Math.max(-SEMI_RANGE, Math.min(SEMI_RANGE, Math.round(lane.semis || 0))),
      breathe: {
        mode: Math.max(0, Math.min(3, Math.round(lane.breathe || 0))),
        onBars: Math.max(1, Math.min(64, Math.round(lane.breatheOn || 8))),
        offBars: Math.max(1, Math.min(64, Math.round(lane.breatheOff || 4))),
        chance: Math.max(1, Math.min(100, Math.round(lane.breatheChance || 100))),
      },
    };
  });
}

export function laneSummary(lane: LaneState, lib: LibraryLoop[], index: number): string {
  const loop = lib.find((l) => l.id === lane.loop);
  return `Lane ${index + 1}: ${loop ? `${loop.name}, ${lane.on ? 'playing' : 'off'}` : 'empty'}`;
}
