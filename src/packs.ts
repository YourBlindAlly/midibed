// Sound packs: folders of Rusty's own recorded sounds, sorted into groups by folder (for example "Solid hits", "Light
// ticks", "Sparse swells"). A drum slot whose built-in sound is "Sample pack" is given a pack and a group; every hit it
// plays picks one sound from that group at random, never the same one twice running, and louder hits favour louder
// sounds. Packs are imported into the app's Documents/packs folder like the loops (the audio is never in the repo).
//
// The pack's groups are read from its folder names, so sorting the files into folders is all it takes to change them.
// A file name may say how loud the sound was ("loud", "medium" or "soft"); without a word, medium.

export type PackSound = {
  pack: string;
  /** The group's display name (the folder name without its number and remark). */
  group: string;
  /** The folder the group was imported from; groups sort by it. */
  folder: string;
  /** Path under Documents/packs, for example "shell kit/1 Solid hits/Shells hit 026 loud 0.5s at 4m32s.flac". */
  file: string;
  /** 1 soft, 2 medium, 3 loud. */
  level: number;
};

export function levelOf(fileName: string): number {
  const n = fileName.toLowerCase();
  if (/\bloud\b/.test(n)) return 3;
  if (/\bsoft\b/.test(n)) return 1;
  return 2;
}

/** "1 Solid hits (bunched clicks that land)" becomes "Solid hits". */
export function cleanGroupName(folder: string): string {
  let n = folder.replace(/^\s*\d+[\s.)-]*/, '');
  n = n.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return n || folder.trim() || 'All';
}

export function parsePacks(json: string): PackSound[] {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.pack === 'string' && typeof e.group === 'string' && typeof e.file === 'string')
      .map((e) => ({
        pack: e.pack,
        group: e.group,
        folder: typeof e.folder === 'string' ? e.folder : e.group,
        file: e.file,
        level: typeof e.level === 'number' ? Math.max(1, Math.min(3, Math.round(e.level))) : 2,
      }));
  } catch {
    return [];
  }
}

export function packNames(lib: PackSound[]): string[] {
  return Array.from(new Set(lib.map((s) => s.pack))).sort((a, b) => a.localeCompare(b));
}

/** The groups of a pack in folder order (so "1 Solid hits" comes before "2 Medium bunches"). */
export function groupNames(lib: PackSound[], pack: string): string[] {
  const seen = new Map<string, string>();
  for (const s of lib) if (s.pack === pack && !seen.has(s.group)) seen.set(s.group, s.folder);
  return Array.from(seen.entries())
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
    .map(([g]) => g);
}

export function soundsIn(lib: PackSound[], pack: string, group: string): PackSound[] {
  return lib.filter((s) => s.pack === pack && s.group === group);
}

export function withoutPack(lib: PackSound[], pack: string): PackSound[] {
  return lib.filter((s) => s.pack !== pack);
}

/** The app's packs folder, set once at start (a file:// URI ending in a slash). */
let packDir = '';
export function setPackDir(uri: string) {
  packDir = uri ? (uri.endsWith('/') ? uri : uri + '/') : '';
}

/** The plain path of a pack file, for the native player. */
export function packPath(file: string): string {
  if (!packDir) return '';
  let base = packDir.replace(/^file:\/\//, '');
  try {
    base = decodeURI(base);
  } catch {
    // keep as it is
  }
  return base + file;
}

export const MAX_PACK_GROUPS = 16;

/**
 * What the engine needs: every group some drum slot uses (at most 16, each once), with its files and loudness, and for
 * each drum the number of its group (-1 when it has none). `voiceOf(d)` is the sound type; type 17 is the sample pack.
 */
export function packGroupsForEngine(
  lib: PackSound[],
  drums: { voice: number; packId?: string; packGroup?: string }[],
  samplePackType: number,
): { groups: { files: { path: string; level: number }[] }[]; slotGroup: number[] } {
  const keys: string[] = [];
  const groups: { files: { path: string; level: number }[] }[] = [];
  const slotGroup = drums.map((d) => {
    if (d.voice !== samplePackType || !d.packId || !d.packGroup) return -1;
    const key = `${d.packId}\u0000${d.packGroup}`;
    let at = keys.indexOf(key);
    if (at < 0) {
      if (keys.length >= MAX_PACK_GROUPS) return -1;
      const files = soundsIn(lib, d.packId, d.packGroup).map((s) => ({ path: packPath(s.file), level: s.level }));
      if (files.length === 0) return -1;
      keys.push(key);
      groups.push({ files });
      at = keys.length - 1;
    }
    return at;
  });
  return { groups, slotGroup };
}
