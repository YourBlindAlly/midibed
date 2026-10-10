/**
 * A simple mixer: one level per part, sent to the receiving app as a volume control change (CC 7, or the
 * loops app's own loop-volume control). Nothing is sent until "Send levels" is switched on, so a synth's
 * own volume is never touched by surprise. EQ is not a standard MIDI control, so it is not here.
 */
export type MixerState = {
  send: boolean;
  bass: number; // 0-127
  pad: number;
  dancer: number;
  drums: number;
  loops: number;
};

export const defaultMixer: MixerState = { send: false, bass: 100, pad: 100, dancer: 100, drums: 100, loops: 100 };

export type MixerMessage = { part: keyof Omit<MixerState, 'send'>; channel: number; cc: number; value: number; loops: boolean };

type RoutingView = {
  mixer: MixerState;
  drone: { channel: number };
  pad: { channel: number };
  dancer: { channel: number };
  drums: { channel: number }[];
  loops: { channel: number };
};

const clamp = (v: number) => Math.max(0, Math.min(127, Math.round(v)));

/** The control changes that set every part's level. `loopCC` is the loops app's own loop-volume control, if it has one. */
export function mixerMessages(s: RoutingView, loopCC?: number): MixerMessage[] {
  if (!s.mixer.send) return [];
  const out: MixerMessage[] = [];
  const seen = new Set<string>();
  const add = (part: MixerMessage['part'], channel: number, cc: number, loops = false) => {
    const k = `${channel}:${cc}:${loops}`;
    if (seen.has(k)) return; // parts sharing a channel: the first one wins
    seen.add(k);
    out.push({ part, channel, cc, value: clamp(s.mixer[part]), loops });
  };
  add('bass', s.drone.channel, 7);
  add('pad', s.pad.channel, 7);
  add('dancer', s.dancer.channel, 7);
  for (const d of s.drums) add('drums', d.channel, 7);
  add('loops', s.loops.channel, loopCC ?? 7, true);
  return out;
}

export function levelText(v: number): string {
  return `${Math.round((clamp(v) / 127) * 100)} percent`;
}
