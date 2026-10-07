/**
 * Must match the native engine (MidiBedEngine.swift `euclidHit` + rotation):
 * a step plays when ((pos * hits) mod steps) < hits, where
 * pos = (step - rotation) mod steps.
 */
export function euclidHit(position: number, hits: number, steps: number): boolean {
  if (hits <= 0 || steps <= 0) return false;
  return (position * hits) % steps < hits;
}

export function euclidPattern(hits: number, steps: number, rotation: number): boolean[] {
  const s = Math.max(1, steps);
  const h = Math.max(0, Math.min(s, hits));
  const out: boolean[] = [];
  for (let i = 0; i < s; i++) {
    const pos = (((i - rotation) % s) + s) % s;
    out.push(euclidHit(pos, h, s));
  }
  return out;
}

/** Spoken-friendly description, e.g. "hits on steps 1, 5, 9, 13 of 16". */
export function describePattern(hits: number, steps: number, rotation: number): string {
  const p = euclidPattern(hits, steps, rotation);
  const on = p.map((v, i) => (v ? i + 1 : 0)).filter((n) => n > 0);
  if (on.length === 0) return `silent, ${p.length} steps`;
  return `hits on steps ${on.join(', ')} of ${p.length}`;
}

/** Compact visual form, e.g. "x...x...x...x...". */
export function patternText(hits: number, steps: number, rotation: number): string {
  return euclidPattern(hits, steps, rotation)
    .map((v) => (v ? 'x' : '.'))
    .join('');
}
