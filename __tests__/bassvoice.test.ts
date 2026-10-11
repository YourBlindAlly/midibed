import {
  BASS_PARAMS,
  BASS_PARAM_COUNT,
  BASS_PRESETS,
  applyBassPreset,
  bassVoiceJson,
  bassVoiceValues,
  defaultBassVoice,
  paramText,
  setBassParam,
} from '../src/bassvoice';
import { defaultState, migrateState } from '../src/config';

declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */
const swift: string = fs.readFileSync(path.join(__dirname, '..', 'modules', 'midibed-engine', 'ios', 'BassVoice.swift'), 'utf8');

describe('bass voice settings table', () => {
  it('lists exactly the settings the native voice has, in the same order', () => {
    const block = swift.slice(swift.indexOf('enum BassParam'), swift.indexOf('static let count'));
    const cases = [...block.matchAll(/^\s*case\s+(\w+)/gm)].map((m) => m[1]);
    expect(cases).toEqual(BASS_PARAMS.map((p) => p.key));
    expect(BASS_PARAM_COUNT).toBe(28);
    expect(swift).toMatch(/static let count = 28/);
  });

  it('its native defaults match the screen defaults', () => {
    const from = swift.indexOf('static let defaults: [Float] = [') + 'static let defaults: [Float] = ['.length;
    const nums: number[] = swift
      .slice(from, swift.indexOf(']', from))
      .split(/[,\s]+/)
      .filter((s: string) => s !== '')
      .map(Number);
    expect(nums).toHaveLength(28);
    const screen = bassVoiceValues(defaultBassVoice);
    nums.forEach((n: number, i: number) => expect(screen[i]).toBeCloseTo(n, 3));
  });

  it('every default and preset value is inside its range', () => {
    BASS_PARAMS.forEach((p) => {
      expect(p.def).toBeGreaterThanOrEqual(p.min);
      expect(p.def).toBeLessThanOrEqual(p.max);
    });
    BASS_PRESETS.forEach((preset) => {
      Object.entries(preset.values).forEach(([key, v]) => {
        const def = BASS_PARAMS.find((p) => p.key === key);
        expect(def).toBeDefined();
        expect(v as number).toBeGreaterThanOrEqual(def!.min);
        expect(v as number).toBeLessThanOrEqual(def!.max);
      });
    });
  });
});

describe('bass voice presets and values', () => {
  it('a preset sets its values; Custom changes nothing', () => {
    const t = applyBassPreset(defaultBassVoice, 1);
    expect(t.preset).toBe(1);
    expect(t.v.sub).toBe(70);
    const back = applyBassPreset(t, 0);
    expect(back.preset).toBe(0);
    expect(back.v).toEqual(t.v);
  });

  it('editing a setting makes it Custom and keeps the rest', () => {
    const t = setBassParam(applyBassPreset(defaultBassVoice, 2), 'cutoff', 80);
    expect(t.preset).toBe(0);
    expect(t.v.cutoff).toBe(80);
    expect(t.v.drive).toBe(60);
  });

  it('clamps settings and ignores unknown ones', () => {
    expect(setBassParam(defaultBassVoice, 'cutoff', 500).v.cutoff).toBe(100);
    expect(setBassParam(defaultBassVoice, 'nope', 5)).toBe(defaultBassVoice);
  });

  it('converts to the units the engine uses', () => {
    const v = bassVoiceValues({ ...defaultBassVoice, v: { ...defaultBassVoice.v, cutoff: 50, aRelease: 1500, lfoRate: 25 } });
    expect(v).toHaveLength(28);
    expect(v[BASS_PARAMS.findIndex((p) => p.key === 'cutoff')]).toBeCloseTo(0.5);
    expect(v[BASS_PARAMS.findIndex((p) => p.key === 'aRelease')]).toBeCloseTo(1.5);
    expect(v[BASS_PARAMS.findIndex((p) => p.key === 'lfoRate')]).toBeCloseTo(2.5);
  });

  it('sends exclusive only when the voice is on', () => {
    expect(JSON.parse(bassVoiceJson({ ...defaultBassVoice, enabled: false, exclusive: true })).exclusive).toBe(false);
    expect(JSON.parse(bassVoiceJson({ ...defaultBassVoice, enabled: true, exclusive: true }))).toMatchObject({ enabled: true, exclusive: true });
  });

  it('says its values in words', () => {
    const get = (k: string) => BASS_PARAMS.find((p) => p.key === k)!;
    expect(paramText(get('cutoff'), 35)).toBe('35 percent');
    expect(paramText(get('aRelease'), 1500)).toBe('1.50 seconds');
    expect(paramText(get('glide'), 0)).toBe('none');
    expect(paramText(get('waveB'), 1)).toBe('Pulse');
    expect(paramText(get('lfoRate'), 25)).toBe('2.5 hertz');
  });
});

describe('saved with the other settings', () => {
  it('is off by default, global, and old settings get it', () => {
    expect(defaultState.bassVoice.enabled).toBe(false);
    const s = migrateState({ bpm: 100 });
    expect(s.bassVoice.v.cutoff).toBe(35);
    const kept = migrateState({ bassVoice: { enabled: true, preset: 3, v: { cutoff: 12 } } });
    expect(kept.bassVoice).toMatchObject({ enabled: true, preset: 3 });
    expect(kept.bassVoice.v.cutoff).toBe(12);
    expect(kept.bassVoice.v.sub).toBe(50);
  });
});
