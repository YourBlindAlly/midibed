import { BAR_CHOICES, bestFit, LANE_COUNT, MATCH_FALLBACK, addToLibrary, matchGain, barsFromLength, defaultLanes, folderNames, isAudioFile, lanesForEngine, loopPath, parseLibrary, setLoopDir, tempoFromName } from '../src/looplib';
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
    // the tempo is the right-most standalone number from 40 to 220, so index numbers are skipped
    expect(tempoFromName('Set126-01 ArabicPerc - Darabouka_01_126.flac')).toBe(126);
    expect(tempoFromName('Set70-04 Taikobongos - Taikobongos_70_Bigtoms.flac')).toBe(70);
    expect(tempoFromName('Single Cajun - Cajon_90_12.flac')).toBe(90);
    expect(tempoFromName('Set90-1 StrangeConga - Bongos_90.flac')).toBe(90);
    expect(tempoFromName('Single Swish EFX Timeless - Swish_EFX_Timeless_07.flac')).toBeNull();
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
    expect(BAR_CHOICES[0]).toBe(-1);
    expect(BAR_CHOICES[1]).toBe(0);
  });

  it('reach the engine with a path, bars, repeats and 0-1 units, and an empty lane never plays', () => {
    setLoopDir('file:///var/mobile/Documents/loops/');
    const lib = JSON.stringify([entry(), entry({ id: 'Set/short', file: 'Set__short.wav', bars: 1, repeats: 2 })]);
    const lanes = defaultLanes();
    lanes[0] = { loop: 'Set/PL_Bongos_90', on: true, level: 80, pan: -50, bars: 0, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[1] = { loop: 'Set/short', on: true, level: 100, pan: 0, bars: 0, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[2] = { loop: 'Set/short', on: true, level: 100, pan: 0, bars: 2, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[3] = { loop: 'gone', on: true, level: 100, pan: 0, bars: 0, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    const out = lanesForEngine(lanes, lib);
    expect(out[0].level).toBeCloseTo(0.8 * MATCH_FALLBACK); // an unmeasured file gets the flat match
    expect(out[0]).toMatchObject({ path: '/var/mobile/Documents/loops/Set__PL_Bongos_90.wav', bars: 4, repeats: 1, pan: -0.5, on: true });
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

describe('loudness matching', () => {
  it('aims the average loudness at the bed and caps the loudest hit', () => {
    // a dense loop (RMS 0.158, peak 0.82): the RMS target decides
    expect(matchGain(0.82, 0.158)).toBeCloseTo(0.04 / 0.158, 3);
    // a sparse loop (RMS 0.047, peak 0.82): the peak cap decides
    expect(matchGain(0.82, 0.047)).toBeCloseTo(0.3 / 0.82, 3);
    // so a matched loop never peaks above the cap, whatever it is
    for (const [peak, rms] of [[0.82, 0.158], [0.82, 0.029], [0.5, 0.2], [0.1, 0.01]]) {
      expect(matchGain(peak, rms) * peak).toBeLessThanOrEqual(0.3 + 1e-9);
    }
    expect(matchGain(undefined, undefined)).toBe(MATCH_FALLBACK);
    expect(matchGain(0, 0.1)).toBe(MATCH_FALLBACK);
  });

  it('applies the matching and the master level to each lane, and 100 percent is the matched level', () => {
    setLoopDir('file:///x/loops/');
    const lib = JSON.stringify([entry({ peak: 0.82, rms: 0.158 })]);
    const lanes = defaultLanes();
    lanes[0] = { loop: 'Set/PL_Bongos_90', on: true, level: 100, pan: 0, bars: 0, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    const g = matchGain(0.82, 0.158);
    expect(lanesForEngine(lanes, lib)[0].level).toBeCloseTo(g);
    expect(lanesForEngine(lanes, lib, 50)[0].level).toBeCloseTo(g * 0.5);
    setLoopDir('');
  });

  it('puts lane levels back to 100 percent once, in the live lanes, every scene and every journey', () => {
    const quiet = { loop: 'a', on: true, level: 30, pan: 0, bars: 0 };
    const old = {
      lanes: [quiet, quiet, quiet, quiet],
      scenes: [{ lanes: [quiet, quiet, quiet, quiet] }],
      journeys: [{ name: 'J', scenes: [{ lanes: [quiet, quiet, quiet, quiet] }] }],
    };
    const s = migrateState(old);
    expect(s.lanes.every((l) => l.level === 100)).toBe(true);
    expect(s.loopMatchVersion).toBe(1);
    // already migrated: levels are left alone
    const again = migrateState({ ...old, loopMatchVersion: 1 });
    expect(again.lanes[0].level).toBe(30);
    // a brand new install has nothing to reset
    expect(migrateState(undefined).lanes.every((l) => l.level === 100)).toBe(true);
  });
});

describe('the Loop player layer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sc = require('../src/shortcuts');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mc = require('../src/midicontrol');
  const withLane = () => {
    setLoopDir('file:///x/loops/');
    const lib = addToLibrary('[]', [entry()]);
    return { ...defaultState, loopLib: lib, lanes: defaultLanes().map((l, i) => (i === 0 ? { ...l, loop: 'Set/PL_Bongos_90', on: true } : l)) };
  };

  it('has the A key (and a capital A to solo it), distinct from the L key for the loops app', () => {
    expect(sc.actionForKey('a')).toEqual({ type: 'layer', layer: 'player' });
    expect(sc.actionForKey('A')).toEqual({ type: 'solo', layer: 'player' });
    expect(sc.actionForKey('l')).toEqual({ type: 'layer', layer: 'loops' });
    expect(mc.MIDI_ACTIONS.some((a: { id: string }) => a.id === 'layer:player')).toBe(true);
    expect(mc.MIDI_ACTIONS.some((a: { id: string }) => a.id === 'solo:player')).toBe(true);
    expect(sc.LAYER_NAMES.player).toBe('Loop player');
  });

  it('switches every lane off when it is off, or when another layer is soloed, and on when soloed itself', () => {
    const s = withLane();
    const on = (st: typeof s) => JSON.parse(toEngineJson(st)).lanes[0].on;
    expect(on(s)).toBe(true);
    expect(on({ ...s, playerOn: false })).toBe(false);
    expect(on({ ...s, solo: 'drums' })).toBe(false);
    expect(on({ ...s, solo: 'player' })).toBe(true);
    expect(on({ ...s, playerOn: false, solo: 'player' })).toBe(true);
    setLoopDir('');
  });

  it('is saved with the scene and on by default', () => {
    expect(defaultState.playerOn).toBe(true);
    const s = switchScene(switchScene({ ...defaultState, playerOn: false }, 1), 0);
    expect(s.playerOn).toBe(false);
    expect(switchScene({ ...defaultState, playerOn: false }, 1).playerOn).toBe(true);
    expect(migrateState({}).playerOn).toBe(true);
  });
});

describe('finding loops', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require('../src/looplib');
  const L = (name: string, folder: string, bpm: number | null) => ({
    id: `${folder}/${name}`, name, folder, file: `${folder}__${name}.wav`, seconds: 10, bpm, bars: 4, repeats: 1,
  });
  const loops = [
    L('Set1 - Bongos_90', '90 flat', 90),
    L('Set2 - Tablas_90', '90 flat', 90),
    L('Conga_138_01', 'Congas', 138),
    L('Shakers_86_01', 'Shakers', 86),
    L('Odd one', 'Other', null),
  ];
  const f = (over: object = {}) => lib.filterLoops(loops, { folder: '', near: 0, bpm: 88, text: '', ...over }).map((l: { name: string }) => l.name);

  it('shows everything with no filter, and a single folder when one is chosen', () => {
    expect(f()).toHaveLength(5);
    expect(f({ folder: 'Congas' })).toEqual(['Conga_138_01']);
  });

  it('keeps loops within a few BPM of the tempo, leaving out loops with no tempo', () => {
    expect(f({ near: 1 })).toEqual(['Set1 - Bongos_90', 'Set2 - Tablas_90', 'Shakers_86_01']); // within 3 of 88
    expect(f({ near: 1, bpm: 90 })).toEqual(['Set1 - Bongos_90', 'Set2 - Tablas_90']);
    expect(f({ near: 3, bpm: 130 })).toEqual(['Conga_138_01']); // within 10
    expect(lib.NEAR_NAMES).toHaveLength(4);
  });

  it('needs every typed word to be in the name or the folder, in any case', () => {
    expect(f({ text: 'conga' })).toEqual(['Conga_138_01']);
    expect(f({ text: 'SHAKER 86' })).toEqual(['Shakers_86_01']);
    expect(f({ text: 'flat tablas' })).toEqual(['Set2 - Tablas_90']);
    expect(f({ text: 'zzz' })).toEqual([]);
  });

  it('combines the filters', () => {
    expect(f({ near: 1, text: 'bongos' })).toEqual(['Set1 - Bongos_90']);
  });
});

describe('best fit length', () => {
  const loop = (bpm: number | null, seconds: number, bars: number, repeats = 1) => ({ seconds, bpm, bars, repeats });

  it('keeps a loop that is already near the tempo', () => {
    const f = bestFit(loop(90, 10.667, 4), 88);
    expect(f.bars).toBe(4);
    expect(f.speed).toBeCloseTo(88 / 90, 2);
  });

  it('plays a 170 BPM loop as half the bars at 88 BPM, and a 44 BPM loop as double', () => {
    const fast = bestFit(loop(170, (16 * 60) / 170, 4), 88); // 4 bars at 170
    expect(fast.bars).toBe(2);
    expect(Math.abs(fast.speed - 1)).toBeLessThan(0.05);
    const slow = bestFit(loop(44, (16 * 60) / 44, 4), 88);
    expect(slow.bars).toBe(8);
    expect(Math.abs(slow.speed - 1)).toBeLessThan(0.05);
  });

  it('picks the simplest of equal fits, and changes the repeats for a loop shorter than a bar', () => {
    // two beats at 90 BPM played twice per bar, at 180 BPM: one bar at normal speed is as good as two bars
    // of two repeats, and the shorter wins
    const f = bestFit(loop(90, 1.333, 1, 2), 180);
    expect(f).toMatchObject({ bars: 1, repeats: 1 });
    expect(Math.abs(f.speed - 1)).toBeLessThan(0.01);
    // a one-beat loop at 90 BPM: at 45 BPM a bar is 5.33 s, which is eight of its repeats at normal speed
    expect(bestFit(loop(90, 0.667, 1, 4), 45)).toMatchObject({ bars: 1, repeats: 8 });
  });

  it('keeps the library length when the tempo is not known', () => {
    expect(bestFit(loop(null, 10, 4), 88)).toMatchObject({ bars: 4, repeats: 1 });
  });

  it('is what a lane set to best fit sends, while a chosen length still wins', () => {
    setLoopDir('file:///x/loops/');
    const lib = JSON.stringify([entry({ id: 'Fast/170', file: 'f.flac', bpm: 170, seconds: (16 * 60) / 170, bars: 4 })]);
    const lanes = defaultLanes();
    lanes[0] = { loop: 'Fast/170', on: true, level: 100, pan: 0, bars: -1, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[1] = { loop: 'Fast/170', on: true, level: 100, pan: 0, bars: 0, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[2] = { loop: 'Fast/170', on: true, level: 100, pan: 0, bars: 8, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    const out = lanesForEngine(lanes, lib, 100, 88);
    expect(out[0].bars).toBe(2);
    expect(out[1].bars).toBe(4);
    expect(out[2].bars).toBe(8);
    setLoopDir('');
  });
});

describe('keep the pitch (time-stretch)', () => {
  const shaker120 = { seconds: 8, bpm: 120, bars: 4, repeats: 1 };
  const fast170 = { seconds: (4 * 4 * 60) / 170, bpm: 170, bars: 4, repeats: 1 };

  it('keeps a whole loop while the stretch is moderate, where best fit would cut it in half', () => {
    expect(bestFit(shaker120, 80).bars).toBe(2); // plain speed change: half the bars, 33 percent faster
    const kept = bestFit(shaker120, 80, true);
    expect(kept.bars).toBe(4);
    expect(kept.speed).toBeCloseTo(0.667, 2);
  });

  it('still cuts a loop when it would need an extreme stretch', () => {
    expect(bestFit(fast170, 88, true).bars).toBe(2);
  });

  it('tells the engine which lanes keep their pitch', () => {
    const lib = JSON.stringify([{ id: 'S/x', name: 'x', folder: 'S', file: 'x.wav', seconds: 8, bpm: 120, bars: 4, repeats: 1 }]);
    const lanes = defaultLanes();
    lanes[0] = { loop: 'S/x', on: true, level: 100, pan: 0, bars: -1, follow: false, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[1] = { loop: 'S/x', on: true, level: 100, pan: 0, bars: -1, follow: true, semis: 0, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    const out = lanesForEngine(lanes, lib, 100, 80);
    expect(out[0].follow).toBe(false);
    expect(out[0].bars).toBe(4);
    expect(out[1].follow).toBe(true);
    expect(out[1].bars).toBe(2);
    expect(out[2].follow).toBe(true);
    expect(out[2].semis).toBe(0);
  });
});

it('the Swift stretch exists and the engine config carries the setting', () => {
  const fs = require('fs');
  const swift = fs.readFileSync('modules/midibed-engine/ios/LoopPlayer.swift', 'utf8');
  expect(swift).toContain('private static func stretch(');
  expect(swift).toContain('func fit(lane: Int, seconds: Double, repeats: Int, follow: Bool, semis: Int)');
  const engine = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
  expect(engine).toContain('var follow: Bool?');
  expect(engine).toContain('var semis: Int?');
  expect(engine).toContain('synth.loops.fit(');
});

describe('pitch shift in semitones', () => {
  const lib = JSON.stringify([{ id: 'S/x', name: 'x', folder: 'S', file: 'x.wav', seconds: 8, bpm: 120, bars: 4, repeats: 1 }]);

  it('sends the shift, clamped to a whole number of semitones within an octave', () => {
    const lanes = defaultLanes();
    lanes[0] = { loop: 'S/x', on: true, level: 100, pan: 0, bars: -1, follow: true, semis: 3, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[1] = { loop: 'S/x', on: true, level: 100, pan: 0, bars: -1, follow: false, semis: -40, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    lanes[2] = { loop: 'S/x', on: true, level: 100, pan: 0, bars: -1, follow: true, semis: 2.6, breathe: 0, breatheOn: 8, breatheOff: 4, breatheChance: 100 };
    const out = lanesForEngine(lanes, lib, 100, 120);
    expect(out.map((l) => l.semis).slice(0, 3)).toEqual([3, -12, 3]);
  });

  it('new lanes follow the tempo with no shift, so nothing changes for saved sounds', () => {
    const l = defaultLanes()[0];
    expect([l.follow, l.semis]).toEqual([true, 0]);
  });

  it('older saved lanes with the short-lived keepPitch setting become follow', () => {
    const old: any = JSON.parse(JSON.stringify(defaultState));
    old.lanes[0].keepPitch = true;
    old.lanes[1].keepPitch = false;
    delete old.lanes[0].follow;
    delete old.lanes[1].follow;
    old.scenes[1].lanes[0].keepPitch = true;
    delete old.scenes[1].lanes[0].follow;
    const m = migrateState(old);
    expect(m.lanes[0].follow).toBe(false);
    expect(m.lanes[1].follow).toBe(true);
    expect(m.scenes[1].lanes[0].follow).toBe(false);
    expect((m.lanes[0] as any).keepPitch).toBeUndefined();
  });
});
