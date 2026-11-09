declare const __dirname: string;
import { FM_PRESETS, applyFMPreset, defaultFMLayer, describeFM, fmLayerJson, fmLayerValues, setFMPart } from '../src/fmlayer';
import { defaultState, migrateState } from '../src/config';

describe('the FM layer (sizzle)', () => {
  it('is off to start with, so nothing changes until it is chosen', () => {
    expect(fmLayerValues(defaultFMLayer)).toEqual([0, 0.4, 0.8, 1, 1.5, 0, 0.4, 0.8, 1, 1.5]);
    expect(defaultState.fmLayer).toEqual(defaultFMLayer);
  });

  it('sends five numbers for the pad then five for the keys', () => {
    const s = { pad: applyFMPreset(defaultFMLayer.pad, 3), keys: applyFMPreset(defaultFMLayer.keys, 4) };
    const v = fmLayerValues(s);
    expect(v).toHaveLength(10);
    expect(v.slice(0, 5)).toEqual([0.22, 0.55, 1, 1, 1.5]);
    expect(v.slice(5)).toEqual([0.25, 0.7, 1.4, 2, 0.8]);
    expect(JSON.parse(fmLayerJson(s)).values).toEqual(v);
  });

  it('editing a setting makes the preset Custom, and clamps to safe values', () => {
    const a = applyFMPreset(defaultFMLayer.pad, 2);
    expect(a.preset).toBe(2);
    const b = setFMPart(a, { sizzle: 90 });
    expect(b.preset).toBe(0);
    expect(b.level).toBe(a.level);
    const wild = fmLayerValues({ pad: { ...a, level: 900, sizzle: -5, shimmer: 0, octave: 9, bloom: 999 }, keys: a });
    expect(wild.slice(0, 5)).toEqual([1, 0, 0.1, 2, 8]);
    expect(FM_PRESETS[1].name).toBe('Off');
  });

  it('describes itself for speech', () => {
    expect(describeFM(defaultFMLayer.pad)).toBe('off');
    expect(describeFM(applyFMPreset(defaultFMLayer.pad, 3))).toBe('level 22, sizzle 55');
  });

  it('old saved settings gain the layer, switched off', () => {
    const m = migrateState({ drums: [{ name: 'Kick' }] });
    expect(m.fmLayer.pad.level).toBe(0);
    expect(m.fmLayer.keys.level).toBe(0);
  });

  it('the Swift synth reads the same order and has the voices', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const dir = path.join(__dirname, '..', 'modules', 'midibed-engine', 'ios');
    const swift: string = fs.readFileSync(path.join(dir, 'MidiBedTestSynth.swift'), 'utf8');
    expect(swift).toContain('fmParams.initialize(from: [0, 0.5, 0.8, 1, 1.5, 0, 0.5, 0.8, 1, 1.5], count: 10)');
    expect(swift).toContain('func configureFM(_ values: [Float])');
    expect(swift).toContain('startFM(part: 1, channel: channel, note: note, velocity: velocity)');
    expect(swift).toContain('for i in 0..<fmCount { fmVoices[i].gate = false }');
    const engine: string = fs.readFileSync(path.join(dir, 'MidiBedEngine.swift'), 'utf8');
    expect(engine).toContain('func setFMLayer(json: String)');
    const mod: string = fs.readFileSync(path.join(dir, 'MidiBedEngineModule.swift'), 'utf8');
    expect(mod).toContain('Function("setFMLayer")');
  });
});
