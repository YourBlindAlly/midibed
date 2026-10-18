// The Keys' built-in electric piano: four types and the controls that shape them. Global (not saved in a
// scene), like the bass voice. The native side (MidiBedTestSynth.swift, configureKeys) takes the number list
// from `keysVoiceValues`, in this order: type, tone, tremolo depth, tremolo rate (Hz), decay (scale),
// attack (seconds), velocity response, release (seconds). KEEP THEM IN STEP (a jest test reads the Swift).
//
// The recipes were designed and level-checked offline (scratchpad keys2_check.py): every type lands on pitch,
// peaks around 0.17 like a pad note, and the centroids order as expected (Mellow, Wurlitzer, Rhodes, Bell).

export const KEYS_TYPE_NAMES = ['Rhodes', 'Wurlitzer (whirly)', 'Mellow electric piano', 'Vibes and bells'];

export type KeysVoiceState = {
  /** 0 is Custom (your own settings); 1 and up are KEYS_PRESETS. Editing a setting makes it Custom. */
  preset: number;
  type: number;
  /** 0-100: how bright. It sets how much the sound bites and a soft low-pass. */
  tone: number;
  /** 0-100: how deep the tremolo is. */
  tremolo: number;
  /** Tenths of a hertz. */
  tremRate: number;
  /** Percent: how long notes ring (100 = normal). */
  decay: number;
  /** Milliseconds of soft start. */
  attack: number;
  /** 0-100: how much the velocity changes the loudness and brightness. Lower is more even and less strident. */
  velSens: number;
  /** Milliseconds a note takes to die away after the key is let go. */
  release: number;
};

type Settings = Omit<KeysVoiceState, 'preset'>;

export const KEYS_PRESETS: { name: string; v: Settings }[] = [
  { name: 'Custom', v: { type: 0, tone: 40, tremolo: 20, tremRate: 48, decay: 100, attack: 2, velSens: 60, release: 120 } },
  { name: 'Rhodes, soft', v: { type: 0, tone: 40, tremolo: 20, tremRate: 48, decay: 100, attack: 2, velSens: 60, release: 120 } },
  { name: 'Rhodes, bright', v: { type: 0, tone: 70, tremolo: 15, tremRate: 48, decay: 100, attack: 2, velSens: 100, release: 120 } },
  { name: 'Mellow electric piano', v: { type: 2, tone: 35, tremolo: 15, tremRate: 45, decay: 120, attack: 4, velSens: 50, release: 160 } },
  { name: 'Wurlitzer', v: { type: 1, tone: 50, tremolo: 30, tremRate: 55, decay: 90, attack: 2, velSens: 80, release: 100 } },
  { name: 'Slow whirly', v: { type: 1, tone: 40, tremolo: 55, tremRate: 30, decay: 110, attack: 3, velSens: 60, release: 140 } },
  { name: 'Vibes', v: { type: 3, tone: 50, tremolo: 40, tremRate: 45, decay: 150, attack: 2, velSens: 70, release: 250 } },
  { name: 'Glass bell', v: { type: 3, tone: 65, tremolo: 0, tremRate: 48, decay: 200, attack: 2, velSens: 70, release: 400 } },
  { name: 'Pad-like Rhodes', v: { type: 0, tone: 30, tremolo: 25, tremRate: 40, decay: 200, attack: 40, velSens: 40, release: 400 } },
];

export const defaultKeysVoice: KeysVoiceState = { preset: 1, ...KEYS_PRESETS[1].v };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export function applyKeysPreset(s: KeysVoiceState, preset: number): KeysVoiceState {
  const p = clamp(Math.round(preset), 0, KEYS_PRESETS.length - 1);
  return p === 0 ? { ...s, preset: 0 } : { ...s, preset: p, ...KEYS_PRESETS[p].v };
}

/** Change one setting; the preset becomes Custom. */
export function setKeysVoice(s: KeysVoiceState, change: Partial<Settings>): KeysVoiceState {
  return { ...s, ...change, preset: 0 };
}

export function keysVoiceValues(s: KeysVoiceState): number[] {
  return [
    clamp(Math.round(s.type), 0, KEYS_TYPE_NAMES.length - 1),
    clamp(s.tone, 0, 100) / 100,
    clamp(s.tremolo, 0, 100) / 100,
    clamp(s.tremRate, 5, 120) / 10,
    clamp(s.decay, 20, 400) / 100,
    clamp(s.attack, 0, 200) / 1000,
    clamp(s.velSens, 0, 100) / 100,
    clamp(s.release, 20, 1500) / 1000,
  ];
}

export function keysVoiceJson(s: KeysVoiceState): string {
  return JSON.stringify({ values: keysVoiceValues(s) });
}
