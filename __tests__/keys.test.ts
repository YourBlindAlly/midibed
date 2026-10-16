import { applyScene, copyScenePart, defaultState, keysChords, migrateState, switchScene, toEngineJson } from '../src/config';
import { KEYS_RHYTHMS, clampKeysRhythm, defaultKeys, keysMask, keysPatternText } from '../src/keys';
import { mixerMessages } from '../src/mixer';
import { UGLY_FX_PARAMS, defaultFx, uglyFxValues } from '../src/uglyfx';
import { MIDI_ACTIONS } from '../src/midicontrol';

const withKeys = (change: Partial<typeof defaultKeys>) => ({ ...defaultState, keys: { ...defaultState.keys, ...change } });

describe('Keys pattern library', () => {
  it('has a generator first and then fixed patterns that fit their steps', () => {
    expect(KEYS_RHYTHMS[0].hits).toEqual([]);
    KEYS_RHYTHMS.slice(1).forEach((r) => {
      expect(r.hits.length).toBeGreaterThan(0);
      expect(Math.max(...r.hits)).toBeLessThan(r.steps);
      expect([16, 32]).toContain(r.steps);
      expect(new Set(r.hits).size).toBe(r.hits.length);
    });
    expect(new Set(KEYS_RHYTHMS.map((r) => r.name)).size).toBe(KEYS_RHYTHMS.length);
  });

  it('turns a pattern into a mask, including 32-step patterns past the 31st bit', () => {
    const offbeat = KEYS_RHYTHMS.findIndex((r) => r.name === 'Offbeat stabs');
    expect(keysMask(offbeat)).toBe(2 ** 2 + 2 ** 6 + 2 ** 10 + 2 ** 14);
    const lilt = KEYS_RHYTHMS.findIndex((r) => r.name === 'Two-bar lilt');
    expect(keysMask(lilt)).toBeGreaterThan(2 ** 30);
    expect(clampKeysRhythm(99)).toBe(KEYS_RHYTHMS.length - 1);
    expect(clampKeysRhythm(-3)).toBe(0);
  });

  it('shows the pattern as x and dots, rotated', () => {
    const offbeat = KEYS_RHYTHMS.findIndex((r) => r.name === 'Offbeat stabs');
    expect(keysPatternText({ rhythm: offbeat, steps: 16, hits: 5, rotation: 0 })).toBe('..x...x...x...x.');
    expect(keysPatternText({ rhythm: offbeat, steps: 16, hits: 5, rotation: 1 })).toBe('...x...x...x...x');
    // the generator: 4 hits over 16 steps is the Euclidean spread the engine uses
    expect(keysPatternText({ rhythm: 0, steps: 16, hits: 4, rotation: 0 })).toBe('x...x...x...x...');
  });
});

describe('Keys in the settings', () => {
  it('is off by default, on its own channel, and saved per scene except the channel', () => {
    expect(defaultState.keys.enabled).toBe(false);
    expect(defaultState.keys.channel).toBe(4);
    const s = withKeys({ enabled: true, rhythm: 4, velocity: 50, channel: 6 });
    const there = switchScene(switchScene(s, 1), 0);
    expect(there.keys.rhythm).toBe(4);
    expect(there.keys.enabled).toBe(true);
    // a scene never changes the channel
    const other = applyScene({ ...s, keys: { ...s.keys, channel: 9 } }, s.scenes[0]);
    expect(other.keys.channel).toBe(9);
  });

  it('can be copied to another scene as a part', () => {
    const s = withKeys({ rhythm: 7, susChance: 40 });
    const copied = copyScenePart(s, 2, 11);
    expect(copied.scenes[2].keys.rhythm).toBe(7);
    expect(copied.scenes[2].keys.susChance).toBe(40);
  });

  it('is sent to the engine with the pattern, the chords in its register and a sus version', () => {
    const lilt = KEYS_RHYTHMS.findIndex((r) => r.name === 'Two-bar lilt');
    const j = JSON.parse(toEngineJson(withKeys({ enabled: true, rhythm: lilt, register: 60, style: 4, susChance: 50, probability: 80, length: 40 }))).keys;
    expect(j.enabled).toBe(true);
    expect(j.channel).toBe(4);
    expect(j.steps).toBe(32);
    expect(j.useMask).toBe(true);
    expect(j.hits).toBe(KEYS_RHYTHMS[lilt].hits.length);
    expect(j.mask).toBe(keysMask(lilt));
    expect(j.probability).toBeCloseTo(0.8);
    expect(j.lengthPct).toBe(40);
    expect(j.susChance).toBeCloseTo(0.5);
    expect(j.chords).toHaveLength(defaultState.harmony.count);
    expect(j.susChords).toHaveLength(defaultState.harmony.count);
    // seventh chords: four notes each, near the lowest note
    for (const c of j.chords as number[][]) {
      expect(c).toHaveLength(4);
      expect(Math.min(...c)).toBeGreaterThanOrEqual(60 - 12);
    }
  });

  it('the generator is sent as a spread, and no sus chords are made when the chance is zero', () => {
    const j = JSON.parse(toEngineJson(withKeys({ rhythm: 0, steps: 12, hits: 5, rotation: 2 }))).keys;
    expect([j.useMask, j.steps, j.hits, j.rotation]).toEqual([false, 12, 5, 2]);
    expect(j.susChords).toEqual([]);
  });

  it('solo and the layer switch decide whether it plays', () => {
    expect(JSON.parse(toEngineJson(withKeys({ enabled: true }))).keys.enabled).toBe(true);
    expect(JSON.parse(toEngineJson({ ...withKeys({ enabled: true }), solo: 'bass' })).keys.enabled).toBe(false);
    expect(JSON.parse(toEngineJson({ ...withKeys({ enabled: false }), solo: 'keys' })).keys.enabled).toBe(true);
    expect(JSON.parse(toEngineJson({ ...withKeys({ enabled: true }), solo: 'keys' })).drone.enabled).toBe(false);
  });

  it('follows the harmony: its chords change with the key', () => {
    const a = keysChords(defaultState);
    const moved = keysChords({ ...defaultState, drone: { ...defaultState.drone, root: defaultState.drone.root + 2 } });
    expect(a).toHaveLength(defaultState.harmony.count);
    expect(moved[0][0] % 12).not.toBe(a[0][0] % 12);
  });

  it('older saved settings get the keys with their defaults', () => {
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.keys;
    delete old.outputs.keys;
    delete old.ports.keys;
    for (const sc of old.scenes) delete sc.keys;
    const m = migrateState(old);
    expect(m.keys).toEqual(defaultKeys);
    expect(m.outputs.keys).toEqual({ midi: true, synth: true });
    expect(m.ports.keys).toBe(false);
    expect(m.scenes[1].keys.rhythm).toBe(defaultKeys.rhythm);
  });
});

describe('Keys routing, level and effects', () => {
  it('has outputs, a MIDI port switch, a mixer level and a MIDI layer action', () => {
    expect(defaultState.outputs.keys).toEqual({ midi: true, synth: true });
    expect(JSON.parse(toEngineJson(defaultState)).outputs.keys).toEqual({ midi: true, synth: true });
    expect(JSON.parse(toEngineJson(defaultState)).ports.keys).toBe(false);
    const m = mixerMessages({ ...defaultState, mixer: { ...defaultState.mixer, send: true, keys: 33 } });
    expect(m.find((x) => x.part === 'keys')).toMatchObject({ channel: 4, cc: 7, value: 33 });
    expect(MIDI_ACTIONS.some((a) => a.id === 'layer:keys')).toBe(true);
    expect(MIDI_ACTIONS.some((a) => a.id === 'solo:keys')).toBe(true);
  });

  it('has its own effects: the last four built-in effect settings', () => {
    const v = uglyFxValues(defaultFx, 90);
    expect(UGLY_FX_PARAMS.slice(-4)).toEqual(['keysPan', 'keysReverb', 'keysDelay', 'keysChorus']);
    expect(v.slice(-4)).toEqual([0, defaultFx.keys.reverb / 100, 0, defaultFx.keys.chorus / 100]);
    expect(v).toHaveLength(UGLY_FX_PARAMS.length);
  });
});

describe('Keys in the Swift engine and synth', () => {
  const fs = require('fs');
  const engine = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
  const synth = fs.readFileSync('modules/midibed-engine/ios/MidiBedTestSynth.swift', 'utf8');
  const fx = fs.readFileSync('modules/midibed-engine/ios/UglyFX.swift', 'utf8');

  it('the engine reads the keys config, plays it and gives it a MIDI source', () => {
    expect(engine).toContain('struct MidiBedKeysConfig');
    expect(engine).toContain('var keys: MidiBedKeysConfig?');
    expect(engine).toContain('private func stepKeys(');
    expect(engine).toContain('"MidiBed Keys"');
    expect(engine).toContain('synth.keysChannel');
    // every config field the JS sends is a field the engine reads
    const j = JSON.parse(toEngineJson(withKeys({ susChance: 10 }))).keys;
    for (const key of Object.keys(j)) expect(engine).toMatch(new RegExp(`var ${key}:`));
  });

  it('the synth has the electric piano voice and the effects have a fifth part', () => {
    expect(synth).toContain('private struct KeysVoice');
    expect(synth).toContain('var keysChannel = -1');
    expect(synth).toContain('keys: partKeys');
    expect(fx).toContain('case keysChorus');
    expect(fx).toContain('static let count = 28');
  });
});
