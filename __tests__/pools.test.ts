import { addLoopToPool, addLoopsToPool, deletePool, newPool, parsePools, removeLoopFromPool, renamePool, stringifyPools } from '../src/pools';
import { KIND_NAMES, filterLoops, instrumentOf, kindOf, lanesForEngine, defaultLanes, setLoopDir } from '../src/looplib';
import { defaultState, migrateState } from '../src/config';

const entry = (o: Record<string, unknown>) => ({ id: 'F/x', name: 'x', folder: 'F', file: 'F__x.flac', seconds: 4, bpm: 90, bars: 2, repeats: 1, peak: 0.8, rms: 0.1, ...o });

describe('pools', () => {
  it('makes, fills, renames and deletes pools', () => {
    let p = newPool([]);
    expect(p[0].name).toBe('Pool 1');
    p = addLoopToPool(p, p[0].id, 'a');
    p = addLoopToPool(p, p[0].id, 'a');
    p = addLoopsToPool(p, p[0].id, ['a', 'b', 'c']);
    expect(p[0].loops).toEqual(['a', 'b', 'c']);
    p = removeLoopFromPool(p, p[0].id, 'b');
    expect(p[0].loops).toEqual(['a', 'c']);
    p = renamePool(p, p[0].id, 'My shakers');
    expect(parsePools(stringifyPools(p))[0].name).toBe('My shakers');
    expect(deletePool(p, p[0].id)).toEqual([]);
    expect(parsePools('nonsense')).toEqual([]);
  });

  it('gives a pool lane every member the lane would play, and falls back without a pool', () => {
    setLoopDir('file:///loops/');
    const lib = JSON.stringify([entry({ id: 'F/a', file: 'a.flac' }), entry({ id: 'F/b', file: 'b.flac', seconds: 8, bars: 4 }), entry({ id: 'F/c', file: 'c.flac' })]);
    const pools = JSON.stringify([{ id: 'pool1', name: 'P', loops: ['F/b', 'F/missing', 'F/c'] }]);
    const lanes = defaultLanes();
    lanes[0] = { ...lanes[0], loop: 'F/a', on: true, pool: 'pool1', poolMode: 1, poolEvery: 8 };
    lanes[1] = { ...lanes[1], loop: 'F/a', on: true, pool: 'gone' };
    const out = lanesForEngine(lanes, lib, 100, 90, pools);
    expect(out[0].pool?.map((m) => m.path.split('/').pop())).toEqual(['b.flac', 'c.flac']);
    expect(out[0].path.endsWith('b.flac')).toBe(true);
    expect(out[0].poolMode).toBe(1);
    expect(out[0].poolEvery).toBe(8);
    expect(out[1].pool).toBeUndefined();
    expect(out[1].path.endsWith('a.flac')).toBe(true);
  });

  it('one valid member is just that loop', () => {
    setLoopDir('file:///loops/');
    const lib = JSON.stringify([entry({ id: 'F/a', file: 'a.flac' }), entry({ id: 'F/c', file: 'c.flac' })]);
    const pools = JSON.stringify([{ id: 'pool1', name: 'P', loops: ['F/c'] }]);
    const lanes = defaultLanes();
    lanes[0] = { ...lanes[0], loop: 'F/a', on: true, pool: 'pool1' };
    const out = lanesForEngine(lanes, lib, 100, 90, pools);
    expect(out[0].pool).toBeUndefined();
    expect(out[0].path.endsWith('c.flac')).toBe(true);
  });

  it('saved state without pools or lane pool fields still loads', () => {
    const s = migrateState({ ...defaultState, pools: undefined } as never);
    expect(s.pools).toBe('[]');
    expect(s.lanes[0].pool).toBe('');
    expect(s.lanes[0].poolEvery).toBe(0);
  });
});

describe('kinds of loops', () => {
  it('tells beds, hits and rhythm loops apart, and ignores a bed tempo', () => {
    expect(kindOf({ name: 'Rain stick bed loop 30s 88bpm', folder: 'Rain stick beds', seconds: 30, bpm: 88 })).toBe('bed');
    expect(kindOf({ name: 'Bell_Hits_01', folder: 'F', seconds: 2, bpm: null })).toBe('hit');
    expect(kindOf({ name: 'Conga_90_01', folder: 'F', seconds: 5, bpm: 90 })).toBe('rhythm');
    expect(kindOf({ name: 'Long thing 100', folder: 'F', seconds: 20, bpm: 100 })).toBe('bed');
    expect(KIND_NAMES.length).toBe(5);
    expect(instrumentOf('Rain stick bed loop 30s 88bpm', 'Rain stick beds')).toBe('Rain stick');
  });

  it('the tempo filter leaves beds alone and the kind filter selects', () => {
    const lib = [
      entry({ id: 'bed', name: 'Rain stick bed 88bpm', folder: 'Rain stick beds', seconds: 30, bpm: 88 }),
      entry({ id: 'far', name: 'far', bpm: 160 }),
      entry({ id: 'near', name: 'near', bpm: 92 }),
    ].map((e) => ({ ...e }));
    const f = (kind: string, near: number) => filterLoops(lib as never, { folder: '', near, bpm: 120, text: '', kind }).map((l) => l.id);
    expect(f('', 1)).toEqual(['bed']); // within 3 BPM of 120: no rhythm loop, but the bed is exempt
    expect(f('rhythm', 0).sort()).toEqual(['far', 'near']);
    expect(f('bed', 1)).toEqual(['bed']);
    expect(f('hit', 0)).toEqual([]);
  });
});
