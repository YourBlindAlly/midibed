/**
 * How MidiBed's own sound leaves the phone: normal stereo, or MONO in both ears, or MONO on the left only,
 * or MONO on the right only. The one-sided choices are for a two-channel set-up where one side goes to the
 * PA and the other carries the monitor (for example VoiceOver panned to the opposite side).
 * Only the built-in sound is affected: another app's audio is its own business.
 *
 * Native: MidiBedTestSynth.outputMode (the last step, after the effects and the transition noise).
 */
export const OUTPUT_MODE_NAMES = ['Stereo', 'Mono, both sides', 'Mono, left side only', 'Mono, right side only'];

export function clampOutputMode(v: number): number {
  return Math.max(0, Math.min(OUTPUT_MODE_NAMES.length - 1, Math.round(Number.isFinite(v) ? v : 0)));
}
