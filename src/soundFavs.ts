/**
 * Sound favorites, kept per APP (profile id), not per sound slot: each remembers its bank
 * (Bank Select MSB/LSB, if the app uses them), its program number and an optional name.
 * Switching a role to another app shows that app's own list. Stored in settings as one JSON
 * string (`soundFavs`) so saved settings merge cleanly. Pure functions only.
 */
export type Favorite = {
  name: string;
  program: number; // 0-127
  sendBank: boolean;
  bankMSB: number; // 0-127
  bankLSB: number; // 0-127
};

export type FavMap = Record<string, Favorite[]>;

export const MAX_FAVORITES = 64;

const clamp127 = (v: unknown, fallback = 0): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(127, n)) : fallback;
};

export function cleanFavorite(raw: unknown): Favorite | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.program === undefined || !Number.isFinite(Number(r.program))) return null;
  const sendBank = r.sendBank === true;
  return {
    name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
    program: clamp127(r.program),
    sendBank,
    bankMSB: sendBank ? clamp127(r.bankMSB) : 0,
    bankLSB: sendBank ? clamp127(r.bankLSB) : 0,
  };
}

/** The same sound: same program and same bank (a name does not make a different sound). */
export function sameFavorite(a: Favorite, b: Favorite): boolean {
  if (a.program !== b.program || a.sendBank !== b.sendBank) return false;
  return !a.sendBank || (a.bankMSB === b.bankMSB && a.bankLSB === b.bankLSB);
}

/** Sorted by bank, then program, so stepping goes in a predictable order. */
function sorted(list: Favorite[]): Favorite[] {
  return [...list].sort(
    (a, b) =>
      Number(a.sendBank) * 1e6 + a.bankMSB * 1e4 + a.bankLSB * 1e2 - (Number(b.sendBank) * 1e6 + b.bankMSB * 1e4 + b.bankLSB * 1e2) ||
      a.program - b.program,
  );
}

export function parseFavMap(json: string): FavMap {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  const out: FavMap = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const clean: Favorite[] = [];
    for (const item of list) {
      const f = cleanFavorite(item);
      if (f && !clean.some((c) => sameFavorite(c, f))) clean.push(f);
    }
    out[id] = sorted(clean).slice(0, MAX_FAVORITES);
  }
  return out;
}

export function stringifyFavMap(map: FavMap): string {
  return JSON.stringify(map);
}

/** Add (or rename, if already there) a favorite for an app. */
export function addFav(json: string, appId: string, fav: Favorite): string {
  const map = parseFavMap(json);
  const list = map[appId] ?? [];
  const i = list.findIndex((f) => sameFavorite(f, fav));
  const clean = cleanFavorite(fav);
  if (!clean) return json;
  if (i >= 0) list[i] = { ...clean, name: clean.name || list[i].name };
  else list.push(clean);
  map[appId] = sorted(list).slice(0, MAX_FAVORITES);
  return stringifyFavMap(map);
}

export function removeFav(json: string, appId: string, fav: Favorite): string {
  const map = parseFavMap(json);
  map[appId] = (map[appId] ?? []).filter((f) => !sameFavorite(f, fav));
  return stringifyFavMap(map);
}

export function favsFor(json: string, appId: string): Favorite[] {
  return parseFavMap(json)[appId] ?? [];
}

/** Program numbers only (the older style), as favorites with no bank. */
export function favsFromPrograms(programs: number[]): Favorite[] {
  return programs.map((program) => ({ name: '', program, sendBank: false, bankMSB: 0, bankLSB: 0 }));
}

/** Spoken description: "Warm pad, bank 2, program 12". */
export function favLabel(f: Favorite, usesLSB = true): string {
  const bank = f.sendBank ? `bank ${f.bankMSB}${usesLSB && f.bankLSB ? `.${f.bankLSB}` : ''}, ` : '';
  return `${f.name ? `${f.name}, ` : ''}${bank}program ${f.program}`;
}
