import { BAR_CHOICES, LANE_COUNT, addToLibrary, barsFromLength, defaultLanes, folderNames, isAudioFile, lanesForEngine, loopPath, parseLibrary, setLoopDir, tempoFromName } from '../src/looplib';
import { copyScenePart, defaultState, migrateState, switchScene, toEngineJson } from '../src/config';

const entry = (over: Partial<ReturnType<typeof parseLibrary>[number]> = {}) => ({
  id: 'Set/PL_Bongos_90',
  name: 'PL_Bongos_90',
  folder: 'Set',
  file: 'Set__PL_Bongos_90.wav',
  seconds: 10.667,
  bpm: 90,
  bars: 4,
  repeats: 1,
  ...over,
});

describe('loop names, lengths and the library', () => {
  it('reads the tempo from the names a loop pack uses', () => {
    expect(tempoFromName('PL_Bongos_90.wav')).toBe(90);
    expect(tempoFromName('PL_Conga_138_02.wav')).toBe(138);
    expect(tempoFromName('Break01_130bpm.wav')).toBe(130);
    expect(tempoFromName('068 BPM (Midwest Ballad)')).toBe(68);
    expect(tempoFromName('Kick.wav')).toBeNull();
    expect(tempoFromName('Loop_999.wav')).toBeNull();
  });

  it('works out whole bars from length and tempo, and repeats for loops shorter than a bar', () => {
    expect(barsFromLength(10.667, 90)).toEqual({ bars: 4, repeats: 1 });
    expect(barsFromLength(13.913, 138)).toEqual({ bars: 8, repeats: 1 });
    expect(barsFromLength(1.091, 110)).toEqual({ bars: 1, repeats: 2 }); // two beats
    expect(barsFromLength(5, null)).toEqual({ bars: 4, repeats: 1 });
  });

  it('recognises audio files and ignores the rest', () => {
    expect(isAudioFile('a.WAV')).toBe(true);
    expect(isAudioFile('a.rx2')).toBe(false);
    expect(isAudioFile('._a.wav')).toBe(false);
  });

  it('keeps a sorted library without duplicates, and lists its folders', () => {
    let json = addToLibrary('[]', [entry({ id: 'B/x', folder: 'B', name: 'x' }), entry({ id: 'A/y', folder: 'A', name: 'y' })]);
    json = addToLibrary(json, [entry({ id: 'A/y', folder: 'A', name: 'y' })]);
    const lib = parseLibrary(json);
    expect(lib.map((l) => l.id)).toEqual(['A/y', 'B/x']);
    expect(folderNames(lib)).toEqual(['A', 'B']);
    expect(parseLibrary('not json')).toEqual([]);
  });
});

describe('lanes', () => {
  it('start empty and off, and are four', () => {
    expect(LANE_COUNT).toBe(4);
    expect(defaultState.lanes).toHaveLength(4);
    expect(defaultState.lanes.every((l) => l.loop === '' && !l.on)).toBe(true);
    expect(BAR_CHOICES[0]).toBe(0);
  });

  it('reach the engine with a path, bars, repeats and 0-1 units, and an empty lane never plays', () => {
    setLoopDir('file:///var/mobile/Documents/loops/');
    const lib = JSON.stringify([entry(), entry({ id: 'Set/short', file: 'Set__short.wav', bars: 1, repeats: 2 })]);
    const lanes = defaultLanes();
    lanes[0] = { loop: 'Set/PL_Bongos_90', on: true, level: 80, pan: -50, bars: 0 };
    lanes[1] = { loop: 'Set/short', on: true, level: 100, pan: 0, bars: 0 };
    lanes[2] = { loop: 'Set/short', on: true, level: 100, pan: 0, bars: 2 };
    lanes[3] = { loop: 'gone', on: true, level: 100, pan: 0, bars: 0 };
    const out = lanesForEngine(lanes, lib);
    expect(out[0]).toEqual({ path: '/var/mobile/Documents/loops/Set__PL_Bongos_90.wav', bars: 4, repeats: 1, level: 0.8, pan: -0.5, on: true });
    expect(out[1]).toMatchObject({ bars: 1, repeats: 2, on: true });
    expect(out[2]).toMatchObject({ bars: 2, repeats: 1 }); // a chosen length replaces the file's own
    expect(out[3]).toMatchObject({ path: '', on: false });
    expect(loopPath('a b.wav')).toBe('/var/mobile/Documents/loops/a b.wav');
    setLoopDir('');
  });

  it('are in the engine configuration, saved per scene, and the library is global', () => {
    setLoopDir('file:///x/loops/');
    const lib = addToLibrary('[]', [entry()]);
    const s = { ...defaultState, loopLib: lib, lanes: defaultLanes().map((l, i) => (i === 0 ? { ...l, loop: 'Set/PL_Bongos_90', on: true } : l)) };
    expect(JSON.parse(toEngineJson(s)).lanes).toHaveLength(4);
    expect(JSON.parse(toEngineJson(s)).lanes[0].on).toBe(true);
    const moved = switchScene(s, 1);
    expect(moved.lanes[0].on).toBe(false); // scene 2 starts with empty lanes
    expect(moved.loopLib).toBe(lib);
    expect(switchScene(moved, 0).lanes[0]).toMatchObject({ loop: 'Set/PL_Bongos_90', on: true });
    setLoopDir('');
  });

  it('can be copied to another scene on their own, and old settings gain empty lanes', () => {
    const s = { ...defaultState, lanes: defaultLanes().map((l, i) => (i === 1 ? { ...l, loop: 'a', on: true } : l)) };
    const out = copyScenePart(s, 2, 10); // 'Loop player lanes'
    expect(out.scenes[2].lanes[1]).toMatchObject({ loop: 'a', on: true });
    expect(out.scenes[2].drums).toEqual(s.scenes[2].drums);
    const migrated = migrateState({});
    expect(migrated.lanes).toHaveLength(4);
    expect(migrated.scenes.every((sc) => sc.lanes.length === 4)).toBe(true);
    expect(migrated.loopLib).toBe('[]');
  });
});
