/**
 * Keyboard shortcuts (a hardware keyboard, or a braille display that types like one, such as the
 * Hable One). Pure mapping from a pressed key to an action; App.tsx performs the action. The native
 * side (MidiBedPagerView) only reports unmodified key presses while MidiBed is in front: iOS does not
 * deliver keys to an app in the background.
 */
export type Layer = 'bass' | 'pad' | 'dancer' | 'drums' | 'loops';

export type ShortcutAction =
  | { type: 'scene'; index: number }
  | { type: 'nextScene' }
  | { type: 'prevScene' }
  | { type: 'nextJourney' }
  | { type: 'prevJourney' }
  | { type: 'playStop' }
  | { type: 'freeze' }
  | { type: 'panic' }
  | { type: 'layer'; layer: Layer };

const LAYER_KEYS: Record<string, Layer> = { r: 'bass', c: 'pad', m: 'dancer', d: 'drums', l: 'loops' };

export const LAYER_NAMES: Record<Layer, string> = {
  bass: 'Bass drone',
  pad: 'Chord pad',
  dancer: 'MidiDancer',
  drums: 'Drums',
  loops: 'Loops',
};

export function actionForKey(raw: string): ShortcutAction | null {
  const key = raw.trim().toLowerCase();
  if (key.length !== 1) return null;
  if (key >= '1' && key <= '9') return { type: 'scene', index: Number(key) - 1 };
  switch (key) {
    case 'n':
      return { type: 'nextScene' };
    case 'b':
      return { type: 'prevScene' };
    case 'j':
      return { type: 'nextJourney' };
    case 'k':
      return { type: 'prevJourney' };
    case 's':
      return { type: 'playStop' };
    case 'f':
      return { type: 'freeze' };
    case 'p':
      return { type: 'panic' };
    default:
      return LAYER_KEYS[key] ? { type: 'layer', layer: LAYER_KEYS[key] } : null;
  }
}

/** Shown on the Setup tab. */
export const SHORTCUT_HELP: string[] = [
  '1 to 4: go to that scene',
  'N: next scene, B: previous scene',
  'J: next journey, K: previous journey',
  'S: start or stop',
  'F: freeze on or off',
  'P: all notes off',
  'D: drums on or off, C: chord pad, R: bass drone (root), M: MidiDancer, L: loops',
];
