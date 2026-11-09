declare const __dirname: string;
import { defaultState, toEngineJson, captureScene, switchScene, migrateState, mergeWeave } from '../src/config';
import { mulberry32 } from '../src/dancer';
import {
  WeaveRuntime,
  applyOneChange,
  defaultWeave,
  defaultWeaveLine1,
  hitsMask,
  lineDegrees,
  lineHits,
  lineSteps,
  mutateAtLoop,
  startRuntime,
  weaveBase,
  weaveNote,
} from '../src/weave';

const line = defaultWeaveLine1;
const rules = { spread: line.spread, lock: 100, changeEvery: 0, changeChance: 100, returnAfter: 0 };

function fresh(): { rt: WeaveRuntime; orig: WeaveRuntime } {
  const hit = lineHits(line);
  const deg = lineDegrees(line);
  return { rt: startRuntime(deg, hit), orig: startRuntime(deg, hit) };
}

describe('MidiWeave starting pattern', () => {
  it('has a rhythm of the right length and a melody in range, the same every time', () => {
    const hits = lineHits(line);
    expect(hits).toHaveLength(16);
    expect(hits.filter(Boolean)).toHaveLength(6);
    const deg = lineDegrees(line);
    expect(deg).toHaveLength(16);
    expect(deg.every((d) => d >= 0 && d <= line.spread - 1)).toBe(true);
    expect(lineDegrees(line)).toEqual(deg);
    expect(lineDegrees({ ...line, seed: line.seed + 1 })).not.toEqual(deg);
  });

  it('rotation moves the hits, and the mask has one bit per hit', () => {
    const a = lineHits(line);
    const b = lineHits({ ...line, rotation: 3 });
    expect(b.filter(Boolean)).toHaveLength(a.filter(Boolean).length);
    expect(b).not.toEqual(a);
    expect(hitsMask([true, false, true])).toBe(5);
    expect(hitsMask(Array(32).fill(true))).toBe(2 ** 32 - 1);
  });

  it('a library rhythm brings its own length', () => {
    expect(lineSteps({ ...line, rhythm: 0, steps: 12 })).toBe(12);
    expect(lineSteps({ ...line, rhythm: 1 })).toBeGreaterThan(0);
  });
});

describe('MidiWeave change rules', () => {
  it('a fully locked line with no scheduled change never changes', () => {
    const { rt, orig } = fresh();
    const rand = mulberry32(5);
    for (let i = 0; i < 200; i++) mutateAtLoop(rt, orig, rules, rand);
    expect(rt.deg).toEqual(orig.deg);
    expect(rt.hit).toEqual(orig.hit);
    expect(rt.loops).toBe(200);
  });

  it('a scheduled change happens on the chosen loops, then the line goes home', () => {
    const { rt, orig } = fresh();
    const r = { ...rules, changeEvery: 2, changeChance: 100, returnAfter: 3 };
    const rand = mulberry32(9);
    let changed = 0;
    let home = 0;
    for (let i = 0; i < 40; i++) {
      const before = rt.changes;
      mutateAtLoop(rt, orig, r, rand);
      if (rt.changes > before) changed += 1;
      if (rt.changes === 0 && before > 0) {
        home += 1;
        expect(rt.deg).toEqual(orig.deg);
        expect(rt.hit).toEqual(orig.hit);
      }
    }
    expect(changed).toBeGreaterThan(5);
    expect(home).toBeGreaterThan(2);
  });

  it('never leaves the range, never loses the anchor, keeps between 2 notes and half the steps', () => {
    const { rt, orig } = fresh();
    const anchor = orig.hit.indexOf(true);
    const rand = mulberry32(21);
    const r = { ...rules, lock: 40, changeEvery: 1, changeChance: 100, returnAfter: 0 };
    for (let i = 0; i < 2000; i++) {
      mutateAtLoop(rt, orig, r, rand);
      expect(rt.hit[anchor]).toBe(true);
      const count = rt.hit.filter(Boolean).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(8);
      expect(rt.deg.every((d) => d >= 0 && d <= line.spread - 1)).toBe(true);
    }
  });

  it('the lock dial lets notes wander, and 100 does not', () => {
    const wander = (lock: number) => {
      const { rt, orig } = fresh();
      const rand = mulberry32(3);
      for (let i = 0; i < 50; i++) mutateAtLoop(rt, orig, { ...rules, lock }, rand);
      return rt.deg.some((d, k) => d !== orig.deg[k]);
    };
    expect(wander(100)).toBe(false);
    expect(wander(50)).toBe(true);
  });

  it('one change alters little', () => {
    const { rt, orig } = fresh();
    const rand = mulberry32(1);
    applyOneChange(rt, line.spread, rand);
    const diffs = rt.deg.filter((d, k) => d !== orig.deg[k]).length + rt.hit.filter((h, k) => h !== orig.hit[k]).length;
    expect(diffs).toBeLessThanOrEqual(3);
  });
});

describe('MidiWeave notes', () => {
  it('maps degrees onto the scale above the base note', () => {
    const base = weaveBase(60, 38); // D
    expect(base).toBe(62);
    const pent = [0, 2, 4, 7, 9];
    expect(weaveNote(0, 0, base, pent, null)).toBe(62);
    expect(weaveNote(3, 0, base, pent, null)).toBe(69);
    expect(weaveNote(5, 0, base, pent, null)).toBe(74);
    expect(weaveNote(0, 1, base, pent, null)).toBe(74);
  });

  it('maps degrees onto the chord tones when following the chords', () => {
    const chord = [64, 60, 67];
    expect(weaveNote(0, 0, 60, [], chord)).toBe(60);
    expect(weaveNote(2, 0, 60, [], chord)).toBe(67);
    expect(weaveNote(3, 0, 60, [], chord)).toBe(72);
  });
});

describe('MidiWeave in the settings', () => {
  it('sends nothing while it is off, so nothing else changes', () => {
    expect(JSON.parse(toEngineJson(defaultState)).weave).toBeUndefined();
  });

  it('sends two lines when on, and a solo of another layer silences it', () => {
    const on = { ...defaultState, weave: { ...defaultState.weave, enabled: true } };
    const w = JSON.parse(toEngineJson(on)).weave;
    expect(w.enabled).toBe(true);
    expect(w.lines[0].channel).toBe(4); // line 1 plays on the Keys' electric piano
    expect(w.lines[1].channel).toBe(6); // line 2 plays on the FM voice
    expect(w.lines).toHaveLength(2);
    expect(w.lines[0].steps).toBe(16);
    expect(w.lines[1].steps).toBe(12);
    expect(w.lines[0].degrees).toHaveLength(16);
    expect(w.intervals.length).toBeGreaterThan(4);
    expect(JSON.parse(toEngineJson({ ...on, solo: 'pad' })).weave).toBeUndefined();
    expect(JSON.parse(toEngineJson({ ...defaultState, solo: 'weave' })).weave.enabled).toBe(true);
  });

  it('each line plays on the sound it is given', () => {
    const base = { ...defaultState.weave, enabled: true, channel: 9 };
    const lines = (a: number, b: number) => base.lines.map((l, i) => ({ ...l, on: true, sound: i === 0 ? a : b }));
    const w = JSON.parse(toEngineJson({ ...defaultState, keys: { ...defaultState.keys, channel: 3 }, fmVoice: { ...defaultState.fmVoice, channel: 11 }, weave: { ...base, lines: lines(2, 1) } })).weave;
    expect(w.lines[0].channel).toBe(9);
    expect(w.lines[1].channel).toBe(11);
    const k = JSON.parse(toEngineJson({ ...defaultState, keys: { ...defaultState.keys, channel: 3 }, weave: { ...base, lines: lines(0, 0) } })).weave;
    expect(k.lines.map((l: { channel: number }) => l.channel)).toEqual([3, 3]);
  });

  it('follow the chords sends the chord list', () => {
    const s = { ...defaultState, weave: { ...defaultState.weave, enabled: true, pitch: 1 } };
    const w = JSON.parse(toEngineJson(s)).weave;
    expect(w.pitch).toBe(1);
    expect(w.chords.length).toBeGreaterThan(0);
    expect(w.chords[0].length).toBeGreaterThan(2);
  });

  it('is saved in each scene and kept apart from the channel', () => {
    const s = { ...defaultState, weave: { ...defaultState.weave, enabled: true, pitch: 1, channel: 7 } };
    const sc = captureScene(s);
    expect((sc.weave as unknown as Record<string, unknown>).channel).toBeUndefined();
    expect(sc.weave.enabled).toBe(true);
    const away = switchScene(switchScene(s, 1), 0);
    expect(away.weave.enabled).toBe(true);
    expect(away.weave.channel).toBe(7);
    expect(away.weave.pitch).toBe(1);
  });

  it('a scene saved before MidiWeave existed gets it switched off', () => {
    const merged = mergeWeave({ ...defaultWeave, enabled: true, channel: 9 }, undefined);
    expect(merged.enabled).toBe(false);
    expect(merged.channel).toBe(9);
    expect(merged.lines).toHaveLength(2);
    const m = migrateState({ drums: [{ name: 'Kick' }] });
    expect(m.weave.lines).toHaveLength(2);
    expect(m.weave.enabled).toBe(false);
  });

  it('the Swift engine has the player and the change rules', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const swift: string = fs.readFileSync(path.join(__dirname, '..', 'modules', 'midibed-engine', 'ios', 'MidiBedEngine.swift'), 'utf8');
    expect(swift).toContain('private func stepWeave(');
    expect(swift).toContain('private func weaveMutate(');
    expect(swift).toContain('private func weaveOneChange(');
    expect(swift).toContain('stepWeave(step: step, time: time, stepDur: stepDur, cfg: cfg)');
    expect(swift).toContain('self.weaveRT = [WeaveRT(), WeaveRT()]');
    expect(swift).toContain('struct MidiBedWeaveConfig: Decodable');
    expect(swift).toContain('var weave: MidiBedWeaveConfig?');
  });
});
