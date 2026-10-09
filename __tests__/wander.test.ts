import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';
import {
  PHASE_NAMES,
  applyOppose,
  blend,
  cycleBarsFromOldSpeed,
  lfoAt,
  phaseOffset,
  smoothBeatsFromOldSmooth,
  toRange,
} from '../src/wander';

describe('the clean cycle', () => {
  it('is at the bottom at the start, the top half way, and back at the bottom after a full cycle', () => {
    expect(lfoAt(0, 8, 0)).toBeCloseTo(0);
    expect(lfoAt(4, 8, 0)).toBeCloseTo(1);
    expect(lfoAt(8, 8, 0)).toBeCloseTo(0);
    expect(lfoAt(2, 8, 0)).toBeCloseTo(0.5);
  });

  it('repeats every cycle, so it lines up with the bars', () => {
    expect(lfoAt(20, 8, 0)).toBeCloseTo(lfoAt(4, 8, 0));
    expect(lfoAt(11, 8, 0)).toBeCloseTo(lfoAt(3, 8, 0));
  });

  it('starts later in the cycle with a phase setting', () => {
    expect(phaseOffset(0)).toBe(0);
    expect(phaseOffset(2)).toBe(0.5);
    expect(lfoAt(0, 8, phaseOffset(2))).toBeCloseTo(1); // half a cycle later: starts at the top
    expect(lfoAt(0, 8, phaseOffset(1))).toBeCloseTo(0.5);
    expect(PHASE_NAMES).toHaveLength(4);
  });

  it('two filters with different cycles drift apart and realign (8 and 12 bars: every 24)', () => {
    const together = [0, 24, 48].map((b) => Math.abs(lfoAt(b, 8, 0) - lfoAt(b, 12, 0)));
    together.forEach((d) => expect(d).toBeLessThan(0.001));
    expect(Math.abs(lfoAt(6, 8, 0) - lfoAt(6, 12, 0))).toBeGreaterThan(0.3); // half a cycle on one, a quarter on the other
  });
});

describe('looseness', () => {
  it('0 is the pure cycle and 1 is the pure wander', () => {
    expect(blend(0.2, 0.9, 0)).toBeCloseTo(0.2);
    expect(blend(0.2, 0.9, 1)).toBeCloseTo(0.9);
    expect(blend(0.2, 0.9, 0.5)).toBeCloseTo(0.55);
  });
  it('stays inside 0 to 1', () => {
    expect(blend(0.2, 0.9, 5)).toBeCloseTo(0.9);
    expect(blend(0.2, 0.9, -5)).toBeCloseTo(0.2);
  });
});

describe('moving against another filter', () => {
  it('at 100 percent a filter mirrors the other exactly', () => {
    const out = applyOppose([0.8, 0.5], [-1, 0], [0, 1]);
    expect(out[0]).toBeCloseTo(0.8);
    expect(out[1]).toBeCloseTo(0.2);
  });

  it('at 70 percent it is mostly opposite', () => {
    const out = applyOppose([0.8, 0.5], [-1, 0], [0, 0.7]);
    expect(out[1]).toBeCloseTo(0.3 * 0.5 + 0.7 * 0.2);
  });

  it('ignores itself, no opposition, and a bad index', () => {
    expect(applyOppose([0.3, 0.6], [-1, -1], [1, 1])).toEqual([0.3, 0.6]);
    expect(applyOppose([0.3, 0.6], [0, 1], [1, 1])).toEqual([0.3, 0.6]);
    expect(applyOppose([0.3, 0.6], [5, -1], [1, 1])).toEqual([0.3, 0.6]);
  });

  it('two filters opposing each other swap smoothly; each is mixed from the originals', () => {
    const out = applyOppose([0.9, 0.1], [1, 0], [1, 1]);
    expect(out[0]).toBeCloseTo(0.9);
    expect(out[1]).toBeCloseTo(0.1);
  });

  it('when the cutoff opens the drum filter closes, so the total stays steadier', () => {
    let spread = (opp: number) => {
      const sums: number[] = [];
      for (let bar = 0; bar < 32; bar += 0.25) {
        const cutoff = lfoAt(bar, 8, 0);
        const drums = lfoAt(bar, 8, 0.1);
        const out = applyOppose([cutoff, drums], [-1, 0], [0, opp]);
        sums.push((out[0] + out[1]) / 2);
      }
      return Math.max(...sums) - Math.min(...sums);
    };
    expect(spread(0.7)).toBeLessThan(spread(0) * 0.6);
  });
});

describe('turning a position into a MIDI value', () => {
  it('maps into the range, either way round', () => {
    expect(toRange(0, 20, 100)).toBe(20);
    expect(toRange(1, 20, 100)).toBe(100);
    expect(toRange(0.5, 20, 100)).toBe(60);
    expect(toRange(0.5, 100, 20)).toBe(60);
    expect(toRange(2, 20, 100)).toBe(100);
  });
});

describe('converting the old second-based settings', () => {
  it('keeps the pace at 88 BPM', () => {
    expect(cycleBarsFromOldSpeed(4)).toBe(9);
    expect(cycleBarsFromOldSpeed(3)).toBe(12);
    expect(cycleBarsFromOldSpeed(40)).toBe(1);
    expect(cycleBarsFromOldSpeed(1)).toBeLessThanOrEqual(64);
    expect(smoothBeatsFromOldSmooth(30)).toBe(4);
    expect(smoothBeatsFromOldSmooth(40)).toBe(6);
  });
});

describe('filter settings', () => {
  it('the drum filter moves against the bass and chord cutoff by default', () => {
    const drum = defaultState.wanderers.find((w) => w.name === 'Drum cutoff');
    expect(drum?.opposes).toBe(0);
    expect(defaultState.wanderers[0].name).toBe('Cutoff');
  });

  it('are sent to the engine in bars, beats and fractions', () => {
    const j = JSON.parse(toEngineJson(defaultState));
    expect(j.wanderers[0]).toMatchObject({ cc: 74, cycleBars: 8, looseness: 0.5, phase: 0, smoothBeats: 4, opposes: -1, opposeAmount: 0.7 });
    expect(j.wanderers[2]).toMatchObject({ channel: 9, opposes: 0 });
    // different cycle lengths, so the filters drift against each other even without opposition
    expect(new Set(j.wanderers.map((w: { cycleBars: number }) => w.cycleBars)).size).toBe(3);
    expect(j.wanderers[0].speed).toBeUndefined();
  });

  it('belong to each scene', () => {
    const live = {
      ...defaultState,
      wanderers: defaultState.wanderers.map((w, i) => (i === 0 ? { ...w, cycleBars: 16, looseness: 20 } : w)),
    };
    const away = switchScene(live, 1);
    expect(away.wanderers[0].cycleBars).toBe(8);
    expect(switchScene(away, 0).wanderers[0]).toMatchObject({ cycleBars: 16, looseness: 20 });
  });

  it('old settings in seconds become bars and beats, fully free and with no opposition, as before', () => {
    const old = {
      wanderers: [
        { name: 'Cutoff', enabled: true, cc: 74, channel: 0, min: 15, max: 105, speed: 4, smooth: 30 },
        { name: 'Resonance', enabled: true, cc: 71, channel: 0, min: 25, max: 85, speed: 3, smooth: 40 },
        { name: 'Drum cutoff', enabled: true, cc: 74, channel: 9, min: 40, max: 127, speed: 4, smooth: 30 },
      ],
      // scene 1 is the active one (refreshed from the live settings), so use scene 2 to test a stored scene
      scenes: [{}, { wanderers: [{ enabled: true, min: 10, max: 90, speed: 3, smooth: 40 }] }],
    };
    const s = migrateState(old);
    expect(s.wanderers[0]).toMatchObject({ cycleBars: 9, smoothBeats: 4, looseness: 100, opposes: -1 });
    expect(s.wanderers[1]).toMatchObject({ cycleBars: 12, smoothBeats: 6, looseness: 100 });
    expect(s.wanderers[2]).toMatchObject({ channel: 9, enabled: true, opposes: -1 });
    expect(s.wanderers[0]).not.toHaveProperty('speed');
    expect(s.scenes[1].wanderers[0]).toMatchObject({ cycleBars: 12, smoothBeats: 6, looseness: 100, min: 10, max: 90 });
  });

  it('settings already in bars are left alone', () => {
    const s = migrateState({ wanderers: [{ cycleBars: 5, looseness: 30 }] });
    expect(s.wanderers[0]).toMatchObject({ cycleBars: 5, looseness: 30 });
  });
});
