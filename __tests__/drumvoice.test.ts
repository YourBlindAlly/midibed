declare const __dirname: string;
import { DRUM_TYPES, defaultDrumVoice, drumTuneText, drumVoicesJson, voiceForName } from '../src/drumvoice';
import { defaultState, migrateState, switchScene } from '../src/config';

describe('built-in drum sounds', () => {
  it('the four starting drums get sensible sounds, and any slot can be any type', () => {
    const types = Object.fromEntries(defaultState.drums.map((d) => [d.name, DRUM_TYPES[d.voice]]));
    expect(types).toEqual({
      Kick: 'Kick',
      Snare: 'Snare',
      Hat: 'Closed hat',
      Shaker: 'Egg shaker',
      Tambourine: 'Tambourine',
      'Low tom': 'Low tom',
      'Mid tom': 'Mid tom',
      'High tom': 'High tom',
    });
    // a hat slot can be made a clap, with its own settings
    const j = JSON.parse(drumVoicesJson([{ note: 42, channel: 9, voice: 3, tune: 2, decay: 150, tone: 20, snap: 80, level: 60 }]));
    expect(j[0]).toEqual({ note: 42, channel: 9, type: 3, tune: 2, decay: 1.5, tone: 0.2, snap: 0.8, level: 0.6 });
  });

  it('clamps everything into range', () => {
    const j = JSON.parse(drumVoicesJson([{ note: 300, channel: 40, voice: 99, tune: 99, decay: 1, tone: -5, snap: 500, level: 1000 }]));
    expect(j[0]).toEqual({ note: 127, channel: 15, type: DRUM_TYPES.length - 1, tune: 12, decay: 0.25, tone: 0, snap: 1, level: 1 });
  });

  it('is saved with the other settings and not in a scene', () => {
    const live = { ...defaultState, drums: defaultState.drums.map((d, i) => (i === 3 ? { ...d, voice: 3, decay: 180 } : d)) };
    const away = switchScene(live, 1);
    expect(away.drums[3]).toMatchObject({ voice: 3, decay: 180 });
    expect(switchScene(away, 0).drums[3]).toMatchObject({ voice: 3, decay: 180 });
    const old = migrateState({ drums: [{ name: 'Kick', note: 40 }] });
    expect(old.drums[0]).toMatchObject({ note: 40, voice: 0, tune: 0, decay: 100, tone: 50, snap: 50, level: 100 });
    expect(old.drums[3].voice).toBe(14);
    // the four new drums arrive switched off, with their own sounds
    expect(old.drums.slice(4).map((d) => [d.name, d.enabled, d.voice])).toEqual([
      ['Tambourine', false, 9],
      ['Low tom', false, 10],
      ['Mid tom', false, 11],
      ['High tom', false, 12],
    ]);
  });

  it('names, and the default values', () => {
    expect(voiceForName('Kick')).toBe(0);
    expect(voiceForName('Closed Hat')).toBe(4);
    expect(voiceForName('Cowbell')).toBe(8);
    expect(defaultDrumVoice.level).toBe(100);
    expect(drumTuneText(0)).toBe('as designed');
    expect(drumTuneText(-1)).toBe('down 1 semitone');
    expect(drumTuneText(5)).toBe('up 5 semitones');
  });

  it('the native sound types are in the same order as this list', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const swift: string = fs.readFileSync(path.join(__dirname, '..', 'modules', 'midibed-engine', 'ios', 'MidiBedTestSynth.swift'), 'utf8');
    const doc = swift.slice(swift.indexOf('/// One drum hit.'), swift.indexOf('private struct DrumVoice'));
    ['0 kick', '1 snare', '2 rim click', '3 clap', '4 closed hat', '5 open hat', '6 sharp shaker', '7 tom', '8 wood block', '9 tambourine', '10 low tom', '11 mid tom', '12 high tom', '13 jingle tambourine', '14 egg shaker', '15 seed shaker'].forEach((s) => expect(doc).toContain(s));
    expect(DRUM_TYPES.map((n) => n.toLowerCase())).toEqual(['kick', 'snare', 'rim click', 'clap', 'closed hat', 'open hat', 'sharp shaker (cabasa-like)', 'tom', 'wood block', 'tambourine', 'low tom', 'mid tom', 'high tom', 'jingle tambourine', 'egg shaker', 'seed shaker (maraca)']);
  });
});
