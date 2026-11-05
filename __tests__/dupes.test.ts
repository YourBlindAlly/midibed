import { fingerprintOf, parseLibrary, planDuplicates } from '../src/looplib';
import { defaultState, dropLoops } from '../src/config';
import { parsePools } from '../src/pools';

const entry = (o: Record<string, unknown>) => ({ id: 'F/x', name: 'x', folder: 'F', file: 'F__x.flac', seconds: 4, bpm: 90, bars: 2, repeats: 1, peak: 0.8, rms: 0.1, ...o });

describe('duplicate loops', () => {
  it('fingerprints measured loops only', () => {
    expect(fingerprintOf(4, 0.8, 0.1)).toBe('4.000|0.80000|0.10000');
    expect(fingerprintOf(4, undefined, 0.1)).toBeNull();
    expect(fingerprintOf(0, 0.8, 0.1)).toBeNull();
  });

  it('finds the copies made by importing from the wrong folder level and keeps the cleaner name', () => {
    const lib = parseLibrary(
      JSON.stringify([
        entry({ id: 'Pete/Single Bongos.flac', folder: 'Pete', name: 'Single Bongos', file: 'Pete__Single Bongos.flac', peak: 0.81, rms: 0.11 }),
        entry({ id: 'loops/Pete__Single Bongos.flac', folder: 'loops', name: 'Pete__Single Bongos', file: 'loops__Pete__Single Bongos.flac', peak: 0.81, rms: 0.11 }),
        entry({ id: 'Pete/Other.flac', file: 'Pete__Other.flac', seconds: 5 }),
        entry({ id: 'Old/NoMeasure.flac', file: 'a.flac', peak: undefined, rms: undefined }),
        entry({ id: 'Old2/NoMeasure.flac', file: 'b.flac', peak: undefined, rms: undefined }),
      ]),
    );
    const plan = planDuplicates(lib);
    expect(plan.remove.map((l) => l.id)).toEqual(['loops/Pete__Single Bongos.flac']);
    expect(plan.remap).toEqual({ 'loops/Pete__Single Bongos.flac': 'Pete/Single Bongos.flac' });
  });

  it('finds nothing when every loop is different', () => {
    const lib = parseLibrary(JSON.stringify([entry({ id: 'A/a', file: 'a.flac', seconds: 3 }), entry({ id: 'A/b', file: 'b.flac', seconds: 6 })]));
    expect(planDuplicates(lib).remove).toEqual([]);
  });

  it('drops loops from the library and points lanes and pools at the kept loop', () => {
    const s0 = defaultState;
    const lanes = s0.lanes.map((l, i) => (i === 0 ? { ...l, loop: 'dup/a', on: true } : l));
    const s = {
      ...s0,
      lanes,
      loopLib: JSON.stringify([entry({ id: 'keep/a', file: 'k.flac' }), entry({ id: 'dup/a', file: 'loops__k.flac' })]),
      pools: JSON.stringify([{ id: 'pool1', name: 'P', loops: ['dup/a', 'keep/a', 'other'] }]),
    };
    const out = dropLoops(s, { 'dup/a': 'keep/a' });
    expect(parseLibrary(out.loopLib).map((l) => l.id)).toEqual(['keep/a']);
    expect(out.lanes[0].loop).toBe('keep/a');
    expect(parsePools(out.pools)[0].loops).toEqual(['keep/a', 'other']);
    expect(dropLoops(s, {})).toBe(s);
  });

  it('also fixes lanes saved in scenes and journeys', () => {
    const s0 = defaultState;
    const swap = (sc: (typeof s0.scenes)[number]) => ({ ...sc, lanes: sc.lanes.map((l, i) => (i === 1 ? { ...l, loop: 'dup/a' } : l)) });
    const s = { ...s0, scenes: s0.scenes.map(swap), journeys: s0.journeys.map((j) => ({ ...j, scenes: j.scenes.map(swap) })) };
    const out = dropLoops(s, { 'dup/a': 'keep/a' });
    expect(out.scenes.every((sc) => sc.lanes[1].loop === 'keep/a')).toBe(true);
    expect(out.journeys.every((j) => j.scenes.every((sc) => sc.lanes[1].loop === 'keep/a'))).toBe(true);
  });
});
