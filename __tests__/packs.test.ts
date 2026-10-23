// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
import { DRUM_TYPES, SAMPLE_PACK_TYPE, drumVoicesJson } from '../src/drumvoice';
import { defaultState, migrateState, switchScene } from '../src/config';
import { MAX_PACK_GROUPS, PackSound, cleanGroupName, groupNames, levelOf, packGroupsForEngine, packNames, parsePacks, setPackDir, withoutPack } from '../src/packs';

const lib: PackSound[] = [
  { pack: 'shell kit', group: 'Solid hits', folder: '1 Solid hits (bunched clicks that land)', file: 'shell kit/1 Solid hits/Shells hit 026 loud 0.5s.flac', level: 3 },
  { pack: 'shell kit', group: 'Solid hits', folder: '1 Solid hits (bunched clicks that land)', file: 'shell kit/1 Solid hits/Shells hit 043 medium 0.4s.flac', level: 2 },
  { pack: 'shell kit', group: 'Light ticks', folder: '4 Light ticks (grace notes)', file: 'shell kit/4 Light ticks/Shells hit 006 medium 0.3s.flac', level: 2 },
  { pack: 'shell kit', group: 'Medium bunches', folder: '2 Medium bunches', file: 'shell kit/2 Medium bunches/Shells hit 005.flac', level: 2 },
];

describe('sound packs', () => {
  it('reads the loudness of a sound from its file name, and tidies a folder name into a group name', () => {
    expect(levelOf('Shells hit 026 loud 0.5s at 4m32s.flac')).toBe(3);
    expect(levelOf('Shells hit 004 soft 0.6s.flac')).toBe(1);
    expect(levelOf('Shells hit 005 medium 0.3s.flac')).toBe(2);
    expect(levelOf('whatever.flac')).toBe(2);
    expect(cleanGroupName('1 Solid hits (bunched clicks that land)')).toBe('Solid hits');
    expect(cleanGroupName('7 Eighth-note loops from the pairs')).toBe('Eighth-note loops from the pairs');
    expect(cleanGroupName('textures- sparse')).toBe('textures- sparse');
    expect(cleanGroupName('Beds - dense')).toBe('Beds - dense');
  });

  it('lists packs and their groups in folder order, and drops a pack', () => {
    expect(packNames(lib)).toEqual(['shell kit']);
    expect(groupNames(lib, 'shell kit')).toEqual(['Solid hits', 'Medium bunches', 'Light ticks']);
    expect(withoutPack(lib, 'shell kit')).toEqual([]);
    expect(parsePacks('not json')).toEqual([]);
    expect(parsePacks(JSON.stringify(lib))).toHaveLength(4);
  });

  it('the engine gets each group once, with paths and loudness, and each drum its group number', () => {
    setPackDir('file:///data/Documents/packs/');
    const drums = [
      { voice: 0 },
      { voice: SAMPLE_PACK_TYPE, packId: 'shell kit', packGroup: 'Solid hits' },
      { voice: SAMPLE_PACK_TYPE, packId: 'shell kit', packGroup: 'Light ticks' },
      { voice: SAMPLE_PACK_TYPE, packId: 'shell kit', packGroup: 'Solid hits' },
      { voice: SAMPLE_PACK_TYPE, packId: 'shell kit', packGroup: 'Nothing here' },
      { voice: SAMPLE_PACK_TYPE, packId: '', packGroup: '' },
    ];
    const r = packGroupsForEngine(lib, drums, SAMPLE_PACK_TYPE);
    expect(r.slotGroup).toEqual([-1, 0, 1, 0, -1, -1]);
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0].files).toEqual([
      { path: '/data/Documents/packs/shell kit/1 Solid hits/Shells hit 026 loud 0.5s.flac', level: 3 },
      { path: '/data/Documents/packs/shell kit/1 Solid hits/Shells hit 043 medium 0.4s.flac', level: 2 },
    ]);
    expect(MAX_PACK_GROUPS).toBe(16);
  });

  it('the drum voice list carries the group only for a drum that has one, so other drums are unchanged', () => {
    const j = JSON.parse(drumVoicesJson([{ note: 36, channel: 9, voice: 17 }, { note: 38, channel: 9, voice: 1 }], [2, -1]));
    expect(j[0].group).toBe(2);
    expect(j[0].type).toBe(17);
    expect(j[1].group).toBeUndefined();
    expect(DRUM_TYPES[17]).toBe('Sample pack');
  });

  it('the pack choice is global like the other sound controls: saved with the settings, not in a scene', () => {
    const live = { ...defaultState, packLib: JSON.stringify(lib), drums: defaultState.drums.map((d, i) => (i === 3 ? { ...d, voice: 17, packId: 'shell kit', packGroup: 'Light ticks' } : d)) };
    const away = switchScene(live, 1);
    expect(away.drums[3]).toMatchObject({ voice: 17, packId: 'shell kit', packGroup: 'Light ticks' });
    expect(switchScene(away, 0).drums[3]).toMatchObject({ packId: 'shell kit', packGroup: 'Light ticks' });
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.packLib;
    old.drums.forEach((d: any) => {
      delete d.packId;
      delete d.packGroup;
    });
    const m = migrateState(old);
    expect(m.packLib).toBe('[]');
    expect(m.drums[0]).toMatchObject({ packId: '', packGroup: '' });
  });

  it('the Swift synth plays the sample pack sound and loads packs in the background', () => {
    const s = fs.readFileSync('modules/midibed-engine/ios/MidiBedTestSynth.swift', 'utf8');
    expect(s).toContain('case 17: // a recorded sound from a sample pack');
    expect(s).toContain('func loadPacks(_ groups:');
    expect(s).toContain('os_unfair_lock_trylock(packLock)');
    expect(s).toContain('if n > 1 && k == last { continue }'); // never the same sound twice running
    expect(s).toContain('max(0, min(17, d.kind))');
    const e = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(e).toContain('func setPacks(json: String)');
    const m = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngineModule.swift', 'utf8');
    expect(m).toContain('Function("setPacks")');
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('<Section title="Sound packs">');
    expect(app).toContain('sound pack`');
  });
});

describe('pack swells as transition sounds', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { packPlan, toEngineJson: toJson } = require('../src/config');

  it('the plan numbers each group once across the drums, the transition sounds, the recurring sound and the ending', () => {
    setPackDir('file:///data/Documents/packs/');
    const s = {
      ...defaultState,
      packLib: JSON.stringify(lib),
      drums: defaultState.drums.map((d, i) => (i === 0 ? { ...d, voice: 17, packId: 'shell kit', packGroup: 'Solid hits' } : d)),
      transitions: {
        entrance: { ...defaultState.transitions.entrance, on: true, source: 1, packId: 'shell kit', packGroup: 'Light ticks' },
        drumBreak: { ...defaultState.transitions.drumBreak, source: 1, packId: 'shell kit', packGroup: 'Solid hits' },
        drumReturn: defaultState.transitions.drumReturn,
      },
      ending: { ...defaultState.ending, noiseSource: 1, noisePackId: 'shell kit', noisePackGroup: 'Light ticks' },
    };
    const p = packPlan(s);
    expect(p.groups).toHaveLength(2);
    expect(p.drumGroup[0]).toBe(0);
    expect(p.drumBreak).toBe(0); // the same group as the drum uses
    expect(p.entrance).toBe(1);
    expect(p.ending).toBe(1);
    expect(p.drumReturn).toBe(-1);
    expect(p.recurring).toBe(-1);
    const j = JSON.parse(toJson(s));
    expect(j.transitions.entrance.sample).toBe(1);
    expect(j.transitions.drumBreak.sample).toBe(0);
    expect(j.transitions.drumReturn.sample).toBeUndefined();
    // a noise sound is exactly as before
    expect(j.transitions.drumReturn).toEqual({ on: false, shape: 1, color: 0, beats: 8, level: 0.25 });
  });

  it('the Swift side places a swell so its loudest part lands on the bar line', () => {
    const s = fs.readFileSync('modules/midibed-engine/ios/MidiBedTestSynth.swift', 'utf8');
    expect(s).toContain('func pickTransitionSample(group g: Int)');
    expect(s).toContain('let peak = Float((Double(bestI) + 0.5) * Double(block) / rate)');
    expect(s).toContain('A recorded swell: read it at its own speed');
    const e = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(e).toContain('let startTime = max(now, barTime - (tp - offset))');
    expect(e).toContain('offset = remaining >= cfg.transitions.minLeadBeats * beat ? max(0, tp - remaining) : tp');
    expect(e).toContain('func playPackTransitionNow(group: Int, level: Double)');
    const m = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngineModule.swift', 'utf8');
    expect(m).toContain('Function("playPackTransitionNow")');
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('A swell from a sound pack');
  });
});
