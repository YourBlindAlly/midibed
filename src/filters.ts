/**
 * Static filter presets, a hold for the filter movement, and which module a preset applies to.
 *
 * A preset parks the filter somewhere on purpose (like turning a DJ filter knob and leaving it): fully open,
 * muffled, a telephone band, only the top. In MidiBed's own sound every preset works (the pad, MidiDancer and
 * drum filters are state-variable filters, so low-pass, high-pass and band-pass come from the same filter, and
 * the bass voice gets one more filter stage). Another app only gets a cutoff and resonance (CC 74 and 71), so
 * only the low-pass presets can reach it; the others leave an outside synth where it was.
 *
 * Native: MidiBedTestSynth.setFilterTargets (the order of the four parts is bass, pad, MidiDancer, drums).
 */
export type FilterPreset = {
  name: string;
  /** 0 = none (the wanderers), 1 low-pass, 2 high-pass, 3 band-pass */
  mode: 0 | 1 | 2 | 3;
  hz: number;
  /** resonance, percent */
  res: number;
};

export const FILTER_PRESETS: FilterPreset[] = [
  { name: 'Wandering', mode: 0, hz: 0, res: 0 },
  { name: 'Open', mode: 1, hz: 18000, res: 0 },
  { name: 'Warm', mode: 1, hz: 6000, res: 10 },
  { name: 'Muffled', mode: 1, hz: 300, res: 10 },
  { name: 'Underwater', mode: 1, hz: 200, res: 35 },
  { name: 'Telephone', mode: 3, hz: 1100, res: 25 },
  { name: 'Mid focus', mode: 3, hz: 900, res: 55 },
  { name: 'Thin', mode: 2, hz: 400, res: 10 },
  { name: 'Top', mode: 2, hz: 1800, res: 10 },
];

/** Which module(s) the preset goes to; the focus key cycles through these. */
export const FILTER_FOCUS_NAMES = ['The whole mix', 'Bass drone only', 'Chord pad only', 'MidiDancer only', 'Drums only'];
const PARTS = ['bass', 'pad', 'dancer', 'drums'] as const;

export function nextFilterPreset(i: number): number {
  return (Math.max(0, Math.min(FILTER_PRESETS.length - 1, Math.round(i))) + 1) % FILTER_PRESETS.length;
}

export function nextFilterFocus(i: number): number {
  return (Math.max(0, Math.min(FILTER_FOCUS_NAMES.length - 1, Math.round(i))) + 1) % FILTER_FOCUS_NAMES.length;
}

/** Does the focus include this module (0 bass, 1 pad, 2 dancer, 3 drums)? */
export function focusIncludes(focus: number, part: number): boolean {
  return focus <= 0 || focus === part + 1;
}

/** Hz to the 0-127 control value of the built-in low-pass (60 Hz * 60^(cc/127)); other synths differ. */
export function hzToCc(hz: number): number {
  return Math.max(0, Math.min(127, Math.round((127 * Math.log(Math.max(60, hz) / 60)) / Math.log(60))));
}

type FilterState = {
  filterPreset: number;
  filterFocus: number;
  filterGlide: number;
  bpm: number;
  drone: { channel: number };
  pad: { channel: number };
  dancer: { channel: number };
  drums: { channel: number }[];
};

/** MIDI channels each module plays on (the drums may use several). */
export function moduleChannels(s: FilterState): number[][] {
  return [[s.drone.channel], [s.pad.channel], [s.dancer.channel], Array.from(new Set(s.drums.map((d) => d.channel)))];
}

/** Does a preset currently own the filter of this MIDI channel? Then its wanderers stand still. */
export function presetOwnsChannel(s: FilterState, channel: number): boolean {
  if (s.filterPreset <= 0) return false;
  return moduleChannels(s).some((chs, part) => focusIncludes(s.filterFocus, part) && chs.includes(channel));
}

/** What the engine's built-in sound is told: per part a mode (0 none), hz and resonance 0-1, and the glide in seconds. */
export function filterTargetsJson(s: FilterState): string {
  const p = FILTER_PRESETS[Math.max(0, Math.min(FILTER_PRESETS.length - 1, Math.round(s.filterPreset)))];
  const glide = (Math.max(0, s.filterGlide) * 60) / Math.max(30, s.bpm);
  const parts = PARTS.map((_, i) =>
    p.mode !== 0 && focusIncludes(s.filterFocus, i) ? { mode: p.mode, hz: p.hz, res: p.res / 100 } : { mode: 0, hz: 0, res: 0 },
  );
  return JSON.stringify({ glide, parts });
}

export function filterSummary(s: Pick<FilterState, 'filterPreset' | 'filterFocus'>): string {
  const p = FILTER_PRESETS[Math.max(0, Math.min(FILTER_PRESETS.length - 1, s.filterPreset))];
  return p.mode === 0 ? 'Filters wandering' : `Filter ${p.name}, ${FILTER_FOCUS_NAMES[s.filterFocus]?.toLowerCase() ?? ''}`;
}
