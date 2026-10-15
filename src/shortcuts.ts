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
  | { type: 'fill' }
  | { type: 'stopStyle' }
  | { type: 'filterHold' }
  | { type: 'filterPreset' }
  | { type: 'filterFocus' }
  | { type: 'layer'; layer: Layer }
  | { type: 'solo'; layer: Layer }
  | { type: 'armSolo' }
  | { type: 'clearSolo' };

const LAYER_KEYS: Record<string, Layer> = { r: 'bass', c: 'pad', m: 'dancer', d: 'drums', l: 'loops' };

export const LAYER_NAMES: Record<Layer, string> = {
  bass: 'Bass drone',
  pad: 'Chord pad',
  dancer: 'MidiDancer',
  drums: 'Drums',
  loops: 'Loops',
};

/**
 * `shift` is true when the key came with Shift (or as a capital). A capital layer letter solos that
 * layer instead of switching it on or off. O arms a solo for the next layer key (for a keyboard
 * with no Shift), and X clears the solo.
 */
export function actionForKey(raw: string, shift = false): ShortcutAction | null {
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();
  if (key.length !== 1) return null;
  const capital = shift || (trimmed !== key && trimmed === trimmed.toUpperCase());
  if (capital && LAYER_KEYS[key]) return { type: 'solo', layer: LAYER_KEYS[key] };
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
    case 'u':
      return { type: 'fill' };
    case 't':
      return { type: 'stopStyle' };
    case 'w':
      return { type: 'filterHold' };
    case 'v':
      return { type: 'filterPreset' };
    case 'g':
      return { type: 'filterFocus' };
    case 'o':
      return { type: 'armSolo' };
    case 'x':
      return { type: 'clearSolo' };
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
  'U: a drum fill now',
  'T: change the type of stop (now, end of the bar, end of the progression, end of the scene)',
  'W: hold the filters where they are, or let them move again',
  'V: next filter preset (wandering, open, warm, muffled, underwater, telephone, mid focus, thin, top)',
  'G: which module the filter preset goes to (the whole mix, or one module)',
  'D: drums on or off, C: chord pad, R: bass drone (root), M: MidiDancer, L: loops',
  'A capital letter (or Shift) solos that part: Shift D hears only the drums. Pressing it again clears the solo.',
  'No capitals? Press O, then the part letter, to solo it. X clears the solo.',
];
