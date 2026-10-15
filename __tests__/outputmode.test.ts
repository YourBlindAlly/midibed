declare const __dirname: string;
import { OUTPUT_MODE_NAMES, clampOutputMode } from '../src/outputmode';
import { defaultState, migrateState, switchScene } from '../src/config';

describe('built-in sound output mode', () => {
  it('has four choices and starts as stereo', () => {
    expect(OUTPUT_MODE_NAMES).toEqual(['Stereo', 'Mono, both sides', 'Mono, left side only', 'Mono, right side only']);
    expect(defaultState.outputMode).toBe(0);
  });

  it('is kept inside the choices', () => {
    expect([-3, 0, 2, 3, 9, 1.4].map(clampOutputMode)).toEqual([0, 0, 2, 3, 3, 1]);
    expect(clampOutputMode(Number.NaN)).toBe(0);
  });

  it('is global (not in scenes) and saved; a damaged value falls back safely', () => {
    expect(switchScene({ ...defaultState, outputMode: 2 }, 1).outputMode).toBe(2);
    expect(migrateState({ outputMode: 3 }).outputMode).toBe(3);
    expect(migrateState({ outputMode: 42 }).outputMode).toBe(3);
    expect(migrateState({}).outputMode).toBe(0);
  });

  it('is applied as the last step of the built-in sound, mono at 0.7071 so the level stays about the same', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const swift: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'modules', 'midibed-engine', 'ios', 'MidiBedTestSynth.swift'), 'utf8');
    expect(swift).toContain('(mixL + mixR) * 0.7071');
    expect(swift).toContain('mixL = mode == 3 ? 0 : mono');
    expect(swift).toContain('mixR = mode == 2 ? 0 : mono');
  });
});
