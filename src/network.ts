// The live link to a recording program (Reaper): MidiBed sends everything it plays over a Network MIDI session
// (RTP-MIDI), and can send a "start recording" message just before the music begins and a "stop" message when it
// stops. The recording program maps those two messages to its own Record and Stop actions.
//
// Global (not in scenes or journeys). Sent to the engine by `networkJson` through a separate native call, so changing
// a setting never re-queues a scene.

export type NetworkState = {
  /** Send what the parts play to a Network MIDI session. */
  on: boolean;
  /** Send the record signal when Play is pressed and the stop signal when MidiBed stops. */
  record: boolean;
  /** MIDI channel of the two signals, 0-15 (shown 1-16). Channel 16 is not used by the parts. */
  channel: number;
  /** Control number that means "start recording" (value 127). */
  startCC: number;
  /** Control number that means "stop" (value 127). */
  stopCC: number;
  /** Index into PREROLLS: how long the music waits after the record signal. */
  preroll: number;
};

export const PREROLLS: { label: string; ms: number; beats: number }[] = [
  { label: 'No wait: at the same moment', ms: 0, beats: 0 },
  { label: 'A quarter of a second', ms: 250, beats: 0 },
  { label: 'Half a second', ms: 500, beats: 0 },
  { label: 'One second', ms: 1000, beats: 0 },
  { label: 'One beat', ms: 0, beats: 1 },
  { label: 'One bar', ms: 0, beats: 4 },
  { label: 'Two bars', ms: 0, beats: 8 },
];

export const defaultNetwork: NetworkState = { on: false, record: false, channel: 15, startCC: 102, stopCC: 103, preroll: 2 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo));

export function networkJson(s: NetworkState): string {
  const p = PREROLLS[clamp(s.preroll, 0, PREROLLS.length - 1)];
  return JSON.stringify({
    enabled: !!s.on,
    record: !!s.record,
    channel: clamp(s.channel, 0, 15),
    startCC: clamp(s.startCC, 0, 127),
    stopCC: clamp(s.stopCC, 0, 127),
    prerollMs: p.ms,
    prerollBeats: p.beats,
  });
}
