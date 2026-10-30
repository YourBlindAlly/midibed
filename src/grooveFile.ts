// A file of grooves, rhythms and journeys that can be loaded into the app (from Dropbox or anywhere the Files picker
// reaches) without a new build, and saved from the app to share or edit. Everything in a file is ADDED: a journey
// never replaces one you have (a repeated name gets a number), a groove with the name of one of yours replaces only
// that groove, and a rhythm is appended to the library so the numbers saved in your scenes keep their meaning.
//
// Shape (every list is optional):
//   { "app": "MidiBed", "grooveFile": 1,
//     "rhythms":  [ { "name": "My hat", "steps": 16, "hits": [2, 6, 10, 14] } ],
//     "grooves":  [ { "name": "...", "about": "...", "swing": 10, "slots": [ <eight drums: null or a drum> ] } ],
//     "journeys": [ <a journey as MidiBed saves it> ] }
// A drum is { "rhythm": "<a rhythm name>" | "euclid": { "hits": 5, "steps": 16 }, "velocity": 80, "rotation": 0,
//   "chance": 100, "humanize": 20, "ghost": { "hits": 3, "velocity": 40 }, "accent": { "every": 4, "boost": 30 },
//   "looseMs": 0, "keepFirst": false }. The eight places are the kit order: Kick, Snare, Hat, Shaker, Tambourine,
//   Low tom, Mid tom, High tom.

import { BedState, Journey, MAX_JOURNEYS, captureJourney, normalizeJourney } from './config';
import { Groove, checkGroove, parseUserGrooves, setUserGrooves } from './grooves';
import { Rhythm, checkRhythm, registerRhythms } from './rhythms';

export const GROOVE_FILE_NAME = 'MidiBed grooves and journeys.json';

function parseList(text: string): unknown[] {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Make the saved rhythms and grooves live. Call on every render, before anything reads the lists. */
export function syncUserLibrary(s: BedState): void {
  registerRhythms(parseList(s.userRhythms));
  setUserGrooves(parseUserGrooves(s.userGrooves));
}

/** The text of a file with the player's grooves and rhythms, and the journeys asked for (their index, or 'all'). */
export function grooveFileText(s: BedState, journeys: number[] | 'all' | 'none' = 'none'): string {
  const saved: Journey[] = s.journeys.map((j, i) => (i === s.activeJourney ? captureJourney(s) : j));
  const chosen = journeys === 'none' ? [] : journeys === 'all' ? saved : journeys.filter((i) => saved[i]).map((i) => saved[i]);
  const out: Record<string, unknown> = { app: 'MidiBed', grooveFile: 1 };
  const rhythms = parseList(s.userRhythms);
  const grooves = parseList(s.userGrooves);
  if (rhythms.length) out.rhythms = rhythms;
  if (grooves.length) out.grooves = grooves;
  if (chosen.length) out.journeys = chosen;
  return JSON.stringify(out, null, 1);
}

export type LoadResult = { state: BedState; ok: boolean; summary: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Add what a file holds. Nothing the player has is replaced except a groove of the same name. */
export function loadGrooveFile(s: BedState, text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: s, ok: false, summary: 'That file could not be read: it is not valid text for MidiBed.' };
  }
  const r = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!r || (r.app !== undefined && r.app !== 'MidiBed') || (!r.grooves && !r.rhythms && !r.journeys)) {
    return { state: s, ok: false, summary: 'That is not a MidiBed grooves and journeys file.' };
  }
  const problems: string[] = [];

  // Rhythms first, because grooves refer to them by name.
  const savedRhythms = parseList(s.userRhythms).map(checkRhythm).filter((x): x is Rhythm => x !== null);
  let addedRhythms = 0;
  if (Array.isArray(r.rhythms)) {
    for (const item of r.rhythms) {
      const c = checkRhythm(item);
      if (!c) {
        problems.push('a rhythm that is not usable');
        continue;
      }
      if (savedRhythms.some((x) => x.name === c.name)) continue;
      savedRhythms.push(c);
      addedRhythms++;
    }
    registerRhythms(savedRhythms);
  }

  // Grooves: the same name as one you saved replaces it; anything else is added.
  const savedGrooves = parseUserGrooves(s.userGrooves);
  let addedGrooves = 0;
  let replacedGrooves = 0;
  if (Array.isArray(r.grooves)) {
    for (const item of r.grooves) {
      const c = checkGroove(item);
      problems.push(...c.problems);
      if (!c.groove) continue;
      const at = savedGrooves.findIndex((g: Groove) => g.name === c.groove!.name);
      if (at >= 0) {
        savedGrooves[at] = c.groove;
        replacedGrooves++;
      } else {
        savedGrooves.push(c.groove);
        addedGrooves++;
      }
    }
  }

  // Journeys are always added after the ones you have.
  let journeys = s.journeys;
  let addedJourneys = 0;
  let skippedJourneys = 0;
  if (Array.isArray(r.journeys)) {
    const current = s.journeys.map((j, i) => (i === s.activeJourney ? captureJourney(s) : j));
    journeys = current;
    for (const item of r.journeys) {
      const ok = item !== null && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).scenes) && ((item as Record<string, unknown>).scenes as unknown[]).length > 0;
      if (!ok) {
        problems.push('a journey that is not usable');
        continue;
      }
      if (journeys.length >= MAX_JOURNEYS) {
        skippedJourneys++;
        continue;
      }
      let j = normalizeJourney(item);
      const base = (typeof j.name === 'string' && j.name.trim() ? j.name.trim() : 'Journey').slice(0, 40);
      let name = base;
      for (let n = 2; journeys.some((x) => x.name === name); n++) name = `${base} ${n}`;
      j = { ...j, name };
      journeys = [...journeys, j];
      addedJourneys++;
    }
  }

  const parts: string[] = [];
  if (addedGrooves) parts.push(plural(addedGrooves, 'groove'));
  if (replacedGrooves) parts.push(`${plural(replacedGrooves, 'groove')} updated`);
  if (addedRhythms) parts.push(plural(addedRhythms, 'rhythm'));
  if (addedJourneys) parts.push(plural(addedJourneys, 'journey'));
  let summary = parts.length ? `Loaded ${parts.join(', ')}.` : 'Nothing new in that file.';
  if (skippedJourneys) summary += ` ${plural(skippedJourneys, 'journey')} left out because the list is full (${MAX_JOURNEYS}).`;
  if (problems.length) summary += ` Skipped: ${[...new Set(problems)].slice(0, 4).join('; ')}.`;

  const state: BedState = { ...s, userGrooves: JSON.stringify(savedGrooves), userRhythms: JSON.stringify(savedRhythms), journeys };
  setUserGrooves(savedGrooves);
  return { state, ok: true, summary };
}

/** Save the current drums as a groove under a name; a groove of yours with that name is replaced. */
export function saveGroove(s: BedState, groove: Groove): BedState {
  const list = parseUserGrooves(s.userGrooves);
  const at = list.findIndex((g) => g.name === groove.name);
  if (at >= 0) list[at] = groove;
  else list.push(groove);
  setUserGrooves(list);
  return { ...s, userGrooves: JSON.stringify(list) };
}

/** Remove one of your grooves by name. */
export function removeGroove(s: BedState, name: string): BedState {
  const list = parseUserGrooves(s.userGrooves).filter((g) => g.name !== name);
  setUserGrooves(list);
  return { ...s, userGrooves: JSON.stringify(list) };
}
