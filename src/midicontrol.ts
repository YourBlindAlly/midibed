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
};

export type MidiActionDef = { id: string; label: string; action: ShortcutAction };

const LAYERS = [
  ['bass', 'Bass drone'],
  ['pad', 'Chord pad'],
  ['dancer', 'MidiDancer'],
  ['drums', 'Drums'],
  ['loops', 'Loops'],
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
