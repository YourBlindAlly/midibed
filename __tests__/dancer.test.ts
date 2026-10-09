import {
  SCALES,
  cycleBars,
  defaultDancer,
  describePhrase,
  makePhrase,
  makePhrases,
  mulberry32,
  resolveScale,
  scaleTones,
} from '../src/dancer';
import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';

const pc = (n: number, root: number) => (((n - root) % 12) + 12) % 12;
const ROOT = 38; // D

describe('scales', () => {
  it('are canonical: start on the home note, rise, stay inside an octave', () => {
    SCALES.slice(1).forEach((s) => {
      expect(s.intervals[0]).toBe(0);
      expect([...s.intervals].sort((a, b) => a - b)).toEqual(s.intervals);
      expect(s.intervals[s.intervals.length - 1]).toBeLessThan(12);
    });
    expect(SCALES[1].intervals).toEqual([0, 2, 3, 5, 7, 8, 10]); // natural minor = Kurd
    expect(SCALES[2].intervals).toEqual([0, 1, 4, 5, 7, 8, 10]); // Phrygian dominant = Hijaz
  });

  it('automatic picks a pentatonic that suits the mode', () => {
    expect(SCALES[resolveScale(0, 5)].name).toBe('Minor pentatonic');
    expect(SCALES[resolveScale(0, 0)].name).toBe('Major pentatonic');
    expect(SCALES[resolveScale(0, 2)].name).toBe('In-sen');
    expect(resolveScale(3, 0)).toBe(3);
  });

  it('lists only notes of the scale inside the range', () => {
    const tones = scaleTones(ROOT, [0, 3, 5, 7, 10], 72, 1);
    expect(tones.length).toBeGreaterThan(3);
    tones.forEach((n) => {
      expect([0, 3, 5, 7, 10]).toContain(pc(n, ROOT));
      expect(n).toBeGreaterThanOrEqual(66);
      expect(n).toBeLessThanOrEqual(78);
    });
  });
});

describe('phrases', () => {
  const d = { ...defaultDancer, enabled: true };

  it('are the same every time for the same settings, and differ with the seed', () => {
    expect(makePhrases(d, 1, ROOT)).toEqual(makePhrases(d, 1, ROOT));
    expect(makePhrases(d, 1, ROOT)).not.toEqual(makePhrases({ ...d, seed: 2 }, 1, ROOT));
  });

  it('only use notes of the scale, inside the range, with sane steps and lengths', () => {
    for (const scale of [0, 1, 2, 5, 10]) {
      const dd = { ...d, scale };
      const iv = SCALES[resolveScale(scale, 1)].intervals;
      makePhrases(dd, 1, ROOT).forEach((p) => {
        expect(p.events.length).toBeGreaterThan(0);
        p.events.forEach(([step, len, note, vel]) => {
          expect(iv).toContain(pc(note, ROOT));
          expect(note).toBeGreaterThanOrEqual(66);
          expect(note).toBeLessThanOrEqual(78);
          expect(step).toBeGreaterThanOrEqual(0);
          expect(len).toBeGreaterThanOrEqual(1);
          expect(vel).toBeGreaterThanOrEqual(1);
          expect(vel).toBeLessThanOrEqual(127);
        });
      });
    }
  });

  it('never run past the longest allowed, never overlap, and span the complete bars they touch', () => {
    for (let seed = 1; seed < 40; seed++) {
      const dd = { ...d, seed, maxBars: 2, density: 100, busyness: 20 };
      makePhrases(dd, 1, ROOT).forEach((p) => {
        let prevEnd = 0;
        p.events.forEach(([step, len]) => {
          expect(step).toBeGreaterThanOrEqual(prevEnd);
          prevEnd = step + len;
        });
        expect(prevEnd).toBeLessThanOrEqual(32);
        expect(p.span).toBe(Math.max(1, Math.ceil(prevEnd / 16)));
        expect(p.span).toBeLessThanOrEqual(2);
      });
    }
  });

  it('start on the downbeat when asked, and anywhere in the bar otherwise', () => {
    const starts = (start: number) => makePhrases({ ...d, start, seed: 5 }, 1, ROOT).map((p) => p.events[0][0]);
    expect(new Set(starts(0))).toEqual(new Set([0]));
    expect(new Set(starts(1)).size).toBeGreaterThan(2);
  });

  it('end on the 2nd or 5th of the scale, like a question', () => {
    const iv = SCALES[1].intervals; // natural minor: 2nd = 2, 5th = 7
    makePhrases({ ...d, scale: 1, octaves: 2 }, 1, ROOT).forEach((p) => {
      const last = p.events[p.events.length - 1];
      expect([iv[1], iv[4]]).toContain(pc(last[2], ROOT));
    });
  });

  it('density sets how many notes, busyness how short', () => {
    const avg = (f: (p: ReturnType<typeof makePhrase>) => number, dd: typeof d) =>
      makePhrases({ ...dd, rests: 0, maxBars: 4 }, 1, ROOT).reduce((a, p) => a + f(p), 0) / 8;
    expect(avg((p) => p.events.length, { ...d, density: 100 })).toBeGreaterThan(avg((p) => p.events.length, { ...d, density: 0 }) + 3);
    const meanLen = (p: ReturnType<typeof makePhrase>) => p.events.reduce((a, e) => a + e[1], 0) / p.events.length;
    expect(avg(meanLen, { ...d, busyness: 100 })).toBeLessThan(avg(meanLen, { ...d, busyness: 0 }));
  });

  it('lean the way the contour says', () => {
    const slope = (contour: number) => {
      let total = 0;
      for (let seed = 1; seed < 30; seed++) {
        const p = makePhrase({ ...d, contour, octaves: 3, density: 100, seed, rests: 0, maxBars: 4 }, 1, ROOT, mulberry32(seed));
        total += p.events[p.events.length - 2][2] - p.events[0][2];
      }
      return total;
    };
    expect(slope(1)).toBeGreaterThan(slope(2));
  });
});

describe('the call and the space', () => {
  it('space is the complete bars the phrase takes, times the multiplier', () => {
    // A phrase from beat 3 of bar 1 to beat 1 of bar 2 takes 2 bars; the response is bars 3 and 4.
    expect(cycleBars(2, 1)).toBe(4);
    expect(cycleBars(1, 1)).toBe(2);
    expect(cycleBars(2, 2)).toBe(6);
  });

  it('describes a phrase in words', () => {
    const text = describePhrase({ span: 2, events: [[8, 4, 62, 70], [16, 4, 64, 70]] }, 1);
    expect(text).toContain('D E');
    expect(text).toContain('beat 3');
    expect(text).toContain('takes 2 bars');
    expect(text).toContain('2 bars of space');
  });
});

describe('settings', () => {
  it('send phrases to the engine only when on', () => {
    expect(JSON.parse(toEngineJson(defaultState)).dancer).toMatchObject({ enabled: false, phrases: [] });
    const on = { ...defaultState, dancer: { ...defaultState.dancer, enabled: true } };
    const j = JSON.parse(toEngineJson(on)).dancer;
    expect(j.enabled).toBe(true);
    expect(j.phrases).toHaveLength(8);
    expect(j.channel).toBe(3);
    expect(toEngineJson(on)).toBe(toEngineJson(on));
  });

  it('follow the scene key change', () => {
    const on = { ...defaultState, dancer: { ...defaultState.dancer, enabled: true, scale: 1 } };
    const a = JSON.parse(toEngineJson(on)).dancer.phrases[0].events.map((e: number[]) => pc(e[2], 38));
    const b = JSON.parse(toEngineJson({ ...on, keyOffset: 3 })).dancer.phrases[0].events.map((e: number[]) => pc(e[2], 41));
    expect(a.every((v: number) => SCALES[1].intervals.includes(v))).toBe(true);
    expect(b.every((v: number) => SCALES[1].intervals.includes(v))).toBe(true);
  });

  it('are saved per scene, except the channel, and old settings get defaults', () => {
    const live = { ...defaultState, dancer: { ...defaultState.dancer, enabled: true, density: 90, channel: 7 } };
    const away = switchScene(live, 1);
    expect(away.dancer.enabled).toBe(false);
    expect(away.dancer.channel).toBe(7);
    const back = switchScene(away, 0);
    expect(back.dancer).toMatchObject({ enabled: true, density: 90, channel: 7 });
    const old = migrateState({ bpm: 90 });
    expect(old.dancer).toEqual(defaultState.dancer);
    expect(old.scenes.every((sc) => sc.dancer.enabled === false)).toBe(true);
  });
});
