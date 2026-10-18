import { SCALES, defaultDancer, makePhrases, resolveScale, scaleTones, PHRASES_IN_POOL, START_NOTE_NAMES } from '../src/dancer';
import { MODE_INTERVALS } from '../src/chords';
import { applyScene, defaultState, migrateState, switchScene, toEngineJson } from '../src/config';
import { KEYS_FOLLOW_NAMES, KEYS_RHYTHMS, defaultKeys } from '../src/keys';
import { KEYS_PRESETS, KEYS_TYPE_NAMES, applyKeysPreset, defaultKeysVoice, keysVoiceJson, keysVoiceValues, setKeysVoice } from '../src/keysvoice';

const noteClass = (n: number, root: number) => (((n - root) % 12) + 12) % 12;

describe('MidiDancer: more varied phrases', () => {
  const root = 62; // D
  const mode = 1; // Dorian
  const base = { ...defaultDancer, enabled: true };

  it('has a bigger set of phrases', () => {
    expect(PHRASES_IN_POOL).toBe(12);
    expect(makePhrases(base, mode, root)).toHaveLength(12);
  });

  it('spreads the starting notes when asked: the set starts on many different notes', () => {
    const tones = scaleTones(root, SCALES[resolveScale(base.scale, mode)].intervals, base.register, base.octaves).length;
    const firstNotes = (startNote: number, seed: number) =>
      new Set(makePhrases({ ...base, startNote, seed }, mode, root).map((p) => p.events[0][2])).size;
    // Spread out: as many different first notes as there are notes in the range (up to the 12 phrases).
    expect(firstNotes(2, 1)).toBeGreaterThanOrEqual(Math.min(tones, 12) - 1);
    // The contour alone starts the arch near the middle every time.
    const arch = Math.max(firstNotes(0, 1), firstNotes(0, 2), firstNotes(0, 3));
    expect(firstNotes(2, 1)).toBeGreaterThanOrEqual(arch);
  });

  it('can start on any note of the scale', () => {
    const tones = scaleTones(root, SCALES[resolveScale(base.scale, mode)].intervals, base.register, base.octaves);
    const starts = new Set<number>();
    for (let seed = 1; seed <= 6; seed++) for (const p of makePhrases({ ...base, startNote: 1, seed }, mode, root)) starts.add(p.events[0][2]);
    for (const n of Array.from(starts)) expect(tones).toContain(n);
    expect(starts.size).toBeGreaterThanOrEqual(tones.length - 1);
  });

  it('is repeatable: the same settings give the same phrases, a new seed gives different ones', () => {
    const a = JSON.stringify(makePhrases(base, mode, root));
    expect(JSON.stringify(makePhrases(base, mode, root))).toBe(a);
    expect(JSON.stringify(makePhrases({ ...base, seed: 2 }, mode, root))).not.toBe(a);
  });

  it('passing notes stay inside the root and mode, never the held last note, and are off by default', () => {
    expect(defaultDancer.colour).toBe(0);
    const pentatonic = SCALES[resolveScale(base.scale, mode)].intervals;
    const modeNotes = MODE_INTERVALS[mode];
    const outsidePenta = (n: number) => !pentatonic.includes(noteClass(n, root));
    // With the chance at zero every note is in the pentatonic scale.
    for (const p of makePhrases({ ...base, colour: 0 }, mode, root)) for (const e of p.events) expect(outsidePenta(e[2])).toBe(false);
    // With a high chance some notes leave it, but only for notes of the mode, only short ones, never the last.
    let seen = 0;
    for (let seed = 1; seed <= 8; seed++) {
      for (const p of makePhrases({ ...base, colour: 60, seed, density: 100 }, mode, root)) {
        p.events.forEach((e, i) => {
          if (outsidePenta(e[2])) {
            seen++;
            expect(modeNotes).toContain(noteClass(e[2], root));
            expect(e[1]).toBeLessThanOrEqual(2);
            expect(i).toBeLessThan(p.events.length - 1);
          }
        });
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('leaves a seven-note scale alone', () => {
    const kurd = SCALES.findIndex((s) => s.name.startsWith('Natural minor'));
    const seven = makePhrases({ ...base, scale: kurd, colour: 60 }, mode, root);
    const intervals = SCALES[kurd].intervals;
    for (const p of seven) for (const e of p.events) expect(intervals).toContain(noteClass(e[2], root));
  });

  it('is saved per scene, and older settings get the new defaults', () => {
    expect(START_NOTE_NAMES).toHaveLength(3);
    const s = { ...defaultState, dancer: { ...defaultState.dancer, colour: 25, startNote: 1 } };
    const there = switchScene(switchScene(s, 1), 0);
    expect([there.dancer.colour, there.dancer.startNote]).toEqual([25, 1]);
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.dancer.startNote;
    delete old.dancer.colour;
    for (const sc of old.scenes) {
      delete sc.dancer.startNote;
      delete sc.dancer.colour;
    }
    const m = migrateState(old);
    expect([m.dancer.startNote, m.dancer.colour]).toEqual([2, 0]);
    expect(applyScene(m, m.scenes[1]).dancer.startNote).toBe(2);
  });

  it('the Swift engine does not repeat a phrase twice running when picking at random', () => {
    const swift = require('fs').readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(swift).toContain('dancerLast');
  });
});

describe('Keys: follow a drum, sparser patterns', () => {
  it('follows nothing by default and the choices are sent to the engine', () => {
    expect(defaultKeys.follow).toBe(0);
    expect(KEYS_FOLLOW_NAMES).toEqual(['Its own pattern', 'On the kick', 'Between the kicks', 'On the snare']);
    const j = JSON.parse(toEngineJson({ ...defaultState, keys: { ...defaultState.keys, follow: 2, followSkip: 1 } })).keys;
    expect([j.follow, j.followSkip]).toEqual([2, 1]);
  });

  it('has sparse patterns for keys that stay in the background', () => {
    const names = KEYS_RHYTHMS.map((r) => r.name);
    for (const n of ['Once a bar', 'Beats 1 and 3', 'Beat 3 only', 'The and of 2', 'Slow offbeats', 'Once in two bars', 'Two-bar slow']) expect(names).toContain(n);
    expect(KEYS_RHYTHMS[0].name).toMatch(/Euclidean/);
    const sparse = KEYS_RHYTHMS.filter((r) => r.hits.length <= 2);
    expect(sparse.length).toBeGreaterThanOrEqual(6);
  });

  it('the Swift engine reads the follow settings for the keys', () => {
    const swift = require('fs').readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(swift).toContain('private func roleHit(');
    expect(swift).toContain('var follow: Int');
    expect(swift).toContain('var followSkip: Int');
  });
});

describe('Keys: the electric piano sound', () => {
  it('has four types and presets that set every control, and editing makes it Custom', () => {
    expect(KEYS_TYPE_NAMES).toHaveLength(4);
    expect(KEYS_PRESETS.length).toBeGreaterThanOrEqual(8);
    const wurli = applyKeysPreset(defaultKeysVoice, KEYS_PRESETS.findIndex((p) => p.name === 'Wurlitzer'));
    expect(wurli.type).toBe(1);
    expect(wurli.preset).toBeGreaterThan(0);
    const edited = setKeysVoice(wurli, { tone: 10 });
    expect(edited.preset).toBe(0);
    expect(edited.type).toBe(1);
    expect(applyKeysPreset(edited, 0).tone).toBe(10);
  });

  it('starts softer than before: a Rhodes with a lower tone and velocity response', () => {
    expect(defaultKeysVoice.type).toBe(0);
    expect(defaultKeysVoice.tone).toBeLessThan(50);
    expect(defaultKeysVoice.velSens).toBeLessThan(100);
  });

  it('sends eight numbers in the order the synth reads them, clamped', () => {
    const v = keysVoiceValues({ ...defaultKeysVoice, type: 9, tone: 150, tremolo: -5, tremRate: 48, decay: 100, attack: 40, velSens: 60, release: 5000 });
    expect(v).toHaveLength(8);
    expect(v[0]).toBe(3); // type clamped
    expect(v[1]).toBe(1); // tone
    expect(v[2]).toBe(0); // tremolo
    expect(v[3]).toBeCloseTo(4.8); // Hz
    expect(v[4]).toBeCloseTo(1); // decay scale
    expect(v[5]).toBeCloseTo(0.04); // seconds
    expect(v[6]).toBeCloseTo(0.6);
    expect(v[7]).toBe(1.5); // release clamped
    expect(JSON.parse(keysVoiceJson(defaultKeysVoice)).values).toHaveLength(8);
  });

  it('is global (not in a scene), saved, and older settings get the default', () => {
    const s = { ...defaultState, keysVoice: applyKeysPreset(defaultState.keysVoice, 6) };
    expect(switchScene(s, 1).keysVoice.preset).toBe(6);
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.keysVoice;
    expect(migrateState(old).keysVoice).toEqual(defaultKeysVoice);
  });

  it('the Swift synth has the controls in the same order and the same starting values', () => {
    const swift = require('fs').readFileSync('modules/midibed-engine/ios/MidiBedTestSynth.swift', 'utf8');
    expect(swift).toContain('func configureKeys(');
    expect(swift).toContain('keysParams.initialize(from: [0, 0.4, 0.2, 4.8, 1.0, 0.002, 0.6, 0.12], count: 8)');
    // those starting values are the first preset's, in the order keysVoiceValues sends them
    const first = keysVoiceValues(defaultKeysVoice);
    expect(first).toEqual([0, 0.4, 0.2, 4.8, 1.0, 0.002, 0.6, 0.12]);
    const engine = require('fs').readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(engine).toContain('func setKeysVoice(');
    const mod = require('fs').readFileSync('modules/midibed-engine/ios/MidiBedEngineModule.swift', 'utf8');
    expect(mod).toContain('Function("setKeysVoice")');
  });
});

describe('softer shakers', () => {
  const { DRUM_TYPES, drumVoicesJson, voiceForName } = require('../src/drumvoice');

  it('has an egg shaker and a seed shaker, and the old one is still a choice', () => {
    expect(DRUM_TYPES[14]).toBe('Egg shaker');
    expect(DRUM_TYPES[15]).toBe('Seed shaker (maraca)');
    expect(DRUM_TYPES[6]).toMatch(/Sharp shaker/);
    expect(voiceForName('Shaker')).toBe(14);
    expect(defaultState.drums.find((d) => d.name === 'Shaker')!.voice).toBe(14);
    const j = JSON.parse(drumVoicesJson([{ note: 82, channel: 9, voice: 15 }]));
    expect(j[0].type).toBe(15);
  });

  it('settings saved with the sharp shaker move to the egg shaker once; a later choice of the sharp one is kept', () => {
    const old: any = JSON.parse(JSON.stringify(defaultState));
    old.drums[3].voice = 6;
    delete old.drumSoundVersion;
    expect(migrateState(old).drums[3].voice).toBe(14);
    expect(migrateState(old).drumSoundVersion).toBe(1);
    const chosen: any = JSON.parse(JSON.stringify(defaultState));
    chosen.drums[3].voice = 6;
    expect(migrateState(chosen).drums[3].voice).toBe(6);
    // other drums are never touched
    old.drums[0].voice = 6;
    expect(migrateState(old).drums[0].voice).toBe(6);
  });

  it('the Swift synth plays both new sounds, and the table allows them', () => {
    const swift = require('fs').readFileSync('modules/midibed-engine/ios/MidiBedTestSynth.swift', 'utf8');
    expect(swift).toContain('case 14: // egg shaker');
    expect(swift).toContain('case 15: // seed shaker');
    expect(swift).toContain('min(15, d.kind)');
  });
});
