/**
 * An orchestrated stop: instead of cutting off wherever it is, the music ends on a bar line, with a fill
 * into it (when fills are on), a last hit and the notes left to ring out. The engine does the timing
 * (native requestEnd in MidiBedEngine.swift); this file is the settings and the words.
 *
 * Stop style 0 is the old behaviour (stop at once). The Stop button, the magic tap, the S key and a MIDI
 * action all use the chosen style. Stopping again while an ending is waiting stops at once.
 */
export type EndingState = {
  /** 0 now, 1 end of this bar, 2 end of the progression, 3 end of the scene */
  style: number;
  /** 0 cut on the bar line (the notes and the reverb ring out), 1 or 2 bars of fade before it */
  fade: number;
  /** a kick on the last downbeat */
  finalHit: boolean;
  /** a noise sound (a Boom by default) on the last downbeat */
  noise: boolean;
  /** index into NOISE_SHAPE_NAMES */
  noiseShape: number;
  /** percent */
  noiseLevel: number;
  /** Beats the bass, pad and keys keep playing the last chord after the final bar line (0 = they stop there). */
  holdBeats: number;
};

export const defaultEnding: EndingState = { style: 0, fade: 0, finalHit: true, noise: true, noiseShape: 3, noiseLevel: 60, holdBeats: 0 };

export const STOP_STYLE_NAMES = ['Stop now', 'End of this bar', 'End of the progression', 'End of the scene'];
export const ENDING_FADE_NAMES = ['Cut on the bar line, notes ring out', 'Fade over the last bar', 'Fade over the last two bars'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** The request the engine takes (style 1-3). */
export function endingJson(e: EndingState): string {
  return JSON.stringify({
    style: clamp(Math.round(e.style), 1, 3),
    fadeBars: clamp(Math.round(e.fade), 0, 2),
    finalHit: !!e.finalHit,
    noise: !!e.noise,
    noiseShape: clamp(Math.round(e.noiseShape), 0, 4),
    noiseLevel: clamp(e.noiseLevel, 0, 100) / 100,
    holdBeats: clamp(Math.round(e.holdBeats || 0), 0, 64),
  });
}

/** The next stop style when the rotate key is pressed. */
export function nextStopStyle(style: number): number {
  return (clamp(Math.round(style), 0, 3) + 1) % STOP_STYLE_NAMES.length;
}

/** What is said when a stop is requested with this style. */
export function endingSentence(style: number): string {
  if (style === 1) return 'Ending at the end of this bar';
  if (style === 2) return 'Ending at the end of the progression';
  if (style === 3) return 'Ending at the end of the scene';
  return 'Stopped';
}

export function barsLeftText(n: number): string {
  return n <= 1 ? 'Ending on the next bar line' : `Ending in ${n} bars`;
}
