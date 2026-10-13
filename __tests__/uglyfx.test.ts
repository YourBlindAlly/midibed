import { defaultState, migrateState, toEngineJson, switchScene } from '../src/config';
import { UGLY_FX_PARAMS, defaultFx, delayMs, uglyFxValues } from '../src/uglyfx';

declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */
const swift: string = fs.readFileSync(path.join(__dirname, '..', 'modules', 'midibed-engine', 'ios', 'UglyFX.swift'), 'utf8');

describe('Ugly FX', () => {
  it('has the same settings, in the same order, as the native effects', () => {
    const block = swift.slice(swift.indexOf('enum UglyFXParam'), swift.indexOf('static let count'));
    const cases = [...block.matchAll(/^\s*case\s+(\w+)/gm)].map((m) => m[1]);
    expect(cases).toEqual(UGLY_FX_PARAMS);
    expect(uglyFxValues(defaultFx, 90)).toHaveLength(UGLY_FX_PARAMS.length);
    expect(swift).toContain(`static let count = ${UGLY_FX_PARAMS.length}`);
  });

  it('turns the screen values into 0-1 amounts, a pan of -1...1 and a delay in milliseconds', () => {
    const v = uglyFxValues({ ...defaultFx, pad: { pan: -50, reverb: 40, delay: 10, chorus: 100 }, size: 80, damp: 20, delayNote: 2, repeats: 90 }, 120);
    expect(v.slice(4, 8)).toEqual([-0.5, 0.4, 0.1, 1]);
    expect(v[16]).toBeCloseTo(0.8);
    expect(v[17]).toBeCloseTo(0.2);
    expect(v[18]).toBe(500); // a quarter note at 120 BPM
    expect(v[19]).toBeCloseTo(0.7); // capped
  });

  it('keeps the delay time inside what the native line can hold', () => {
    expect(delayMs({ ...defaultFx, delayNote: 2 }, 30)).toBe(1500);
    expect(delayMs({ ...defaultFx, delayNote: 0 }, 400)).toBe(75);
  });

  it('is global: scenes do not carry it, and old settings get the defaults', () => {
    const s = { ...defaultState, fx: { ...defaultFx, size: 90 } };
    expect(switchScene(s, 1).fx.size).toBe(90);
    expect(migrateState({}).fx).toEqual(defaultFx);
    expect(migrateState({ fx: { size: 70 } }).fx.pad.reverb).toBe(30);
    expect(JSON.parse(toEngineJson(s))).not.toHaveProperty('fx');
  });
});
