/**
 * MIDI control: a foot pedal or any MIDI controller can run the same actions as the keyboard shortcuts.
 * Mappings are LEARNED (press "Learn", then a button on the controller), so it does not matter what a
 * pedal sends by default. A mapping is stored as a trigger string: "cc:<channel>:<number>",
 * "note:<channel>:<number>" or "pc:<channel>:<number>" (channels 0-15, as MIDI counts them).
 */
import type { ShortcutAction } from './shortcuts';

export type MidiMessage = { kind: 'cc' | 'note' | 'pc'; channel: number; number: number; value: number };

export type MidiControlState = {
  enabled: boolean;
  /** -1 listens to every channel, otherwise 0-15. */
  channel: number;
  /** JSON: action id -> trigger key (see parseMidiMap). */
  map: string;
  /** JSON: action id -> the action a quick double press of its button does (see parseDoubleMap). */
  double: string;
  /** How quickly the second press must follow, in milliseconds. */
  doubleMs: number;
  /** JSON: action id -> the action holding the button down does (see parseHoldMap). */
  hold: string;
  /** How long a button must stay down to count as held, in milliseconds. */
  holdMs: number;
};

export type MidiActionDef = { id: string; label: string; action: ShortcutAction };

const LAYERS = [
  ['bass', 'Bass drone'],
  ['pad', 'Chord pad'],
  ['dancer', 'MidiDancer'],
  ['drums', 'Drums'],
  ['loops', 'Loops app'],
  ['player', 'Loop player'],
] as const;

// New actions go at the END so a saved mapping keeps its meaning.
export const MIDI_ACTIONS: MidiActionDef[] = [
  { id: 'scene1', label: 'Go to scene 1', action: { type: 'scene', index: 0 } },
  { id: 'scene2', label: 'Go to scene 2', action: { type: 'scene', index: 1 } },
  { id: 'scene3', label: 'Go to scene 3', action: { type: 'scene', index: 2 } },
  { id: 'scene4', label: 'Go to scene 4', action: { type: 'scene', index: 3 } },
  { id: 'nextScene', label: 'Next scene', action: { type: 'nextScene' } },
  { id: 'prevScene', label: 'Previous scene', action: { type: 'prevScene' } },
  { id: 'nextJourney', label: 'Next journey', action: { type: 'nextJourney' } },
  { id: 'prevJourney', label: 'Previous journey', action: { type: 'prevJourney' } },
  { id: 'playStop', label: 'Start or stop', action: { type: 'playStop' } },
  { id: 'freeze', label: 'Freeze on or off', action: { type: 'freeze' } },
  { id: 'panic', label: 'All notes off', action: { type: 'panic' } },
  ...LAYERS.map(([layer, name]) => ({ id: `layer:${layer}`, label: `${name} on or off`, action: { type: 'layer', layer } as ShortcutAction })),
  ...LAYERS.map(([layer, name]) => ({ id: `solo:${layer}`, label: `Solo ${name}`, action: { type: 'solo', layer } as ShortcutAction })),
  { id: 'clearSolo', label: 'Clear solo', action: { type: 'clearSolo' } },
  { id: 'fill', label: 'Drum fill now', action: { type: 'fill' } },
  { id: 'stopStyle', label: 'Change the type of stop', action: { type: 'stopStyle' } },
  { id: 'filterHold', label: 'Hold the filters or let them move', action: { type: 'filterHold' } },
  { id: 'filterPreset', label: 'Next filter preset', action: { type: 'filterPreset' } },
  { id: 'filterFocus', label: 'Which module the filter preset goes to', action: { type: 'filterFocus' } },
  { id: 'sceneChangeAt', label: 'When scene changes land', action: { type: 'sceneChangeAt' } },
  ...[0, 1, 2, 3].map((i) => ({ id: `lane${i + 1}`, label: `Loop lane ${i + 1} on or off`, action: { type: 'lane', index: i } as ShortcutAction })),
];

export function triggerKey(m: Pick<MidiMessage, 'kind' | 'channel' | 'number'>): string {
  return `${m.kind}:${m.channel}:${m.number}`;
}

export type MidiMap = Record<string, string>; // action id -> trigger key

export function parseMidiMap(json: string): MidiMap {
  try {
    const raw = JSON.parse(json);
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: MidiMap = {};
    for (const a of MIDI_ACTIONS) {
      const v = (raw as Record<string, unknown>)[a.id];
      if (typeof v === 'string' && /^(cc|note|pc):\d{1,2}:\d{1,3}$/.test(v)) out[a.id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Map an action to the message just received (the message is taken off any other action first). */
export function assignTrigger(json: string, actionId: string, m: MidiMessage): string {
  const map = parseMidiMap(json);
  const key = triggerKey(m);
  for (const id of Object.keys(map)) if (map[id] === key) delete map[id];
  if (MIDI_ACTIONS.some((a) => a.id === actionId)) map[actionId] = key;
  return JSON.stringify(map);
}

export function clearTrigger(json: string, actionId: string): string {
  const map = parseMidiMap(json);
  delete map[actionId];
  return JSON.stringify(map);
}

/** A button press: a note on, a program change, or a control change with a value above zero. */
export function isPress(m: MidiMessage): boolean {
  return m.kind === 'pc' || m.value > 0;
}

/** Which action ids are an on/off toggle, so a double press can put the first press back before doing its own thing. */
export function isToggleAction(a: ShortcutAction): boolean {
  return a.type === 'freeze' || a.type === 'layer' || a.type === 'solo' || a.type === 'filterHold' || a.type === 'lane';
}

export function parseDoubleMap(json: string): Record<string, string> {
  try {
    const raw = JSON.parse(json);
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v !== k && MIDI_ACTIONS.some((a) => a.id === k) && MIDI_ACTIONS.some((a) => a.id === v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** What holding the button down does (same shape as the double map). Needs a pedal that sends a release. */
export const parseHoldMap = parseDoubleMap;

/** Is this press the second of a quick double press? `last` is the previous press of a button with a double. */
export function isDoublePress(last: { id: string; at: number } | null, id: string, now: number, windowMs: number): boolean {
  return !!last && last.id === id && now - last.at >= 0 && now - last.at <= windowMs;
}

/**
 * Should a hold be watched for? Only for a button that has a hold action AND has already been seen to send
 * a release (Momentary mode on the pedal). A pedal in Single mode never sends one, and then every tap would
 * look like a hold.
 */
export function holdArmed(hasHold: boolean, releaseSeen: boolean): boolean {
  return hasHold && releaseSeen;
}

/** Set (or, with null, clear) what a quick double press of this action's button does. */
export function setDouble(json: string, actionId: string, doubleId: string | null): string {
  const map = parseDoubleMap(json);
  if (doubleId && doubleId !== actionId && MIDI_ACTIONS.some((a) => a.id === doubleId) && MIDI_ACTIONS.some((a) => a.id === actionId)) map[actionId] = doubleId;
  else delete map[actionId];
  return JSON.stringify(map);
}

/** The id of the action a received message is mapped to, or null. */
export function idForMidi(json: string, m: MidiMessage, channel = -1): string | null {
  if (!isPress(m)) return null;
  if (channel >= 0 && m.channel !== channel) return null;
  const key = triggerKey(m);
  const map = parseMidiMap(json);
  return Object.keys(map).find((k) => map[k] === key) ?? null;
}

/** The action a received message runs, or null. `channel` is -1 for any channel, else 0-15. */
export function actionForMidi(json: string, m: MidiMessage, channel = -1): ShortcutAction | null {
  if (!isPress(m)) return null;
  if (channel >= 0 && m.channel !== channel) return null;
  const key = triggerKey(m);
  const map = parseMidiMap(json);
  const id = Object.keys(map).find((k) => map[k] === key);
  return MIDI_ACTIONS.find((a) => a.id === id)?.action ?? null;
}

/** Spoken description: "control change 20 on channel 1". */
export function describeMidi(m: Pick<MidiMessage, 'kind' | 'channel' | 'number'> & { value?: number }): string {
  const what = m.kind === 'cc' ? 'control change' : m.kind === 'note' ? 'note' : 'program change';
  return `${what} ${m.number} on channel ${m.channel + 1}`;
}

export function describeTrigger(key: string | undefined): string {
  if (!key) return 'not set';
  const [kind, channel, number] = key.split(':');
  if (kind !== 'cc' && kind !== 'note' && kind !== 'pc') return 'not set';
  return describeMidi({ kind, channel: Number(channel), number: Number(number) });
}

/** Same as setDouble, for what holding the button does. */
export const setHold = setDouble;
