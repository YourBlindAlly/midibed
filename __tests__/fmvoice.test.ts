declare const __dirname: string;
import { FM_VOICE_PRESETS, applyFMVoicePreset, defaultFMVoice, fmVoiceJson, fmVoiceValues, setFMVoice } from '../src/fmvoice';
import { defaultState, migrateState } from '../src/config';

describe('the standalone FM voice', () => {
  it('sends eight numbers in the order the Swift reads', () => {
    const v = fmVoiceValues(defaultFMVoice);
    expect(v).toEqual([0.7, 0.35, 0.5, 0.15, 0.8, 0, 0, 6]);
    expect(JSON.parse(fmVoiceJson(defaultFMVoice)).values).toEqual(v);
    expect(defaultState.fmVoice).toEqual(defaultFMVoice);
  });

  it('presets set everything and editing makes it Custom', () => {
    const bell = applyFMVoicePreset(defaultFMVoice, 4);
    expect(FM_VOICE_PRESETS[4].name).toBe('Glass bell');
    expect(bell.character).toBe(1);
    expect(bell.channel).toBe(6);
    expect(setFMVoice(bell, { bright: 90 }).preset).toBe(0);
  });

  it('clamps to safe values', () => {
    const v = fmVoiceValues({ ...defaultFMVoice, level: 900, bright: -5, decay: 9999, pluck: 0, shimmer: 0, character: 5, octave: 9, channel: 99 });
    expect(v).toEqual([1, 0, 4, 0.02, 0.1, 1, 2, 15]);
  });

  it('old saved settings gain it', () => {
    expect(migrateState({ drums: [{ name: 'Kick' }] }).fmVoice.channel).toBe(6);
  });

  it('the Swift synth plays it on its own channel', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const dir = path.join(__dirname, '..', 'modules', 'midibed-engine', 'ios');
    const swift: string = fs.readFileSync(path.join(dir, 'MidiBedTestSynth.swift'), 'utf8');
    expect(swift).toContain('fmVoiceParams.initialize(from: [0.7, 0.5, 0.5, 0.2, 0.8, 0, 0, -1], count: 8)');
    expect(swift).toContain('if Int(channel) == fmChannel {');
    expect(swift).toContain('func configureFMVoice(_ values: [Float])');
    expect(fs.readFileSync(path.join(dir, 'MidiBedEngine.swift'), 'utf8')).toContain('func setFMVoice(json: String)');
    expect(fs.readFileSync(path.join(dir, 'MidiBedEngineModule.swift'), 'utf8')).toContain('Function("setFMVoice")');
  });
});
