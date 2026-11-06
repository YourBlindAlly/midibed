import { defaultState, migrateState } from '../src/config';
import { applyPadPreset, defaultPadVoice, padVoiceValues, PAD_PRESETS } from '../src/padvoice';

const fs = require('fs');
const path = require('path');
const swift = (f: string) => fs.readFileSync(path.join(process.cwd(), 'modules', 'midibed-engine', 'ios', f), 'utf8');

describe('chord changes that start early, and the pad fade times', () => {
  it('is off by default, kept when saved, and clamped to 0-1000 ms', () => {
    expect(defaultState.chordLead).toBe(0);
    expect(migrateState({ ...defaultState, chordLead: 250 }).chordLead).toBe(250);
    expect(migrateState({ ...defaultState, chordLead: 99999 }).chordLead).toBe(1000);
    expect(migrateState({ ...defaultState, chordLead: -5 }).chordLead).toBe(0);
    const old: any = { ...defaultState };
    delete old.chordLead;
    expect(migrateState(old).chordLead).toBe(0);
  });

  it('has its own bass setting, off by default, kept when saved and clamped', () => {
    expect(defaultState.bassLead).toBe(0);
    expect(migrateState({ ...defaultState, bassLead: 120 }).bassLead).toBe(120);
    expect(migrateState({ ...defaultState, bassLead: 5000 }).bassLead).toBe(1000);
    const old: any = { ...defaultState, chordLead: 200 };
    delete old.bassLead;
    const m = migrateState(old);
    expect(m.bassLead).toBe(0);
    expect(m.chordLead).toBe(200);
  });

  it('keeps the pad swell at the original 900 and 1600 ms, and a preset does not change the times you chose', () => {
    expect(defaultPadVoice.fadeIn).toBe(900);
    expect(defaultPadVoice.fadeOut).toBe(1600);
    expect(padVoiceValues({ ...defaultPadVoice, fadeIn: 300, fadeOut: 700 }).slice(7)).toEqual([0.3, 0.7]);
    expect(padVoiceValues({ ...defaultPadVoice, fadeIn: 1, fadeOut: 99999 }).slice(7)).toEqual([0.05, 4]);
    const chosen = { ...defaultPadVoice, fadeIn: 300, fadeOut: 700 };
    const after = applyPadPreset(chosen, PAD_PRESETS.findIndex((p) => p.name === 'Soft'));
    expect(after.fadeIn).toBe(300);
    expect(after.fadeOut).toBe(700);
    expect(after.wave).toBe(40);
  });

  it('the native side reads the fade times, starts the chord early, and the bar line only moves the chord on', () => {
    const synth = swift('MidiBedTestSynth.swift');
    expect(synth).toContain('padParams[7]');
    expect(synth).toContain('padParams[8]');
    const engine = swift('MidiBedEngine.swift');
    expect(engine).toContain('func setChordLead(');
    expect(engine).toContain('reconcileDrone(keepLevel: true, chord: upcoming)');
    expect(engine).toContain('earlyPadDone');
    expect(engine).toContain('earlyBassDone');
    expect(engine).toContain('func setBassLead(');
    expect(swift('MidiBedEngineModule.swift')).toContain('Function("setChordLead")');
    expect(swift('MidiBedEngineModule.swift')).toContain('Function("setBassLead")');
  });
});
