import { defaultLanes, filterLoops, instrumentList, instrumentOf, lanesForEngine, LibraryLoop } from '../src/looplib';
import { drumsAreOut, laneMayPlay } from '../src/lanebreath';
import { defaultEnding, endingJson } from '../src/ending';
import { MIDI_ACTIONS } from '../src/midicontrol';
import { actionForKey } from '../src/shortcuts';
import { defaultState, migrateState, applyScene, switchScene } from '../src/config';

const loop = (name: string, folder = 'F'): LibraryLoop => ({ id: `${folder}/${name}.flac`, name, folder, file: `${name}.flac`, seconds: 8, bpm: 100, bars: 4, repeats: 1 });

describe('instrument from a loop name', () => {
  it.each([
    ['CANISTER1 INB 16THS 100bpm', 'Shaker'],
    ['CAXIXI QUARTERS 90bpm', 'Shaker'],
    ['NUTS N BOLTS QUARTERS 60bpm', 'Shaker'],
    ['MARACAS STR 8THS 90bpm', 'Shaker'],
    ['Hi Seed Shaker 100bpm 1_4n On', 'Shaker'],
    ['TAMBOURINE 2 AND 4 90bpm', 'Tambourine'],
    ['Tambourine 120bpm Triplets', 'Tambourine'],
    ['Single Tambourine - Tambourine_90_01', 'Tambourine'],
    ['Set1 StrangeConga - Bongos_90', 'Bongos'],
    ['Set3 ZilTalking - Tabla_90', 'Tabla'],
    ['Single Cajun - Cajun_90_01', 'Cajon'],
    ['Single Udu - Udu_110', 'Udu'],
    ['Single Congas - Congas_100_02', 'Congas'],
    ['Swish EFX Timeless - Swish_12', 'Effects'],
  ])('%s is a %s', (name, instrument) => {
    expect(instrumentOf(name)).toBe(instrument);
  });

  it('the part after the set label decides, and the folder is the last resort', () => {
    expect(instrumentOf('Set2 ReqToms - Tabla_90')).toBe('Tabla');
    expect(instrumentOf('mystery 1', 'Bongos')).toBe('Bongos');
    expect(instrumentOf('mystery 1')).toBe('Other');
  });

  it('lists the instruments found, alphabetical, Other last, and filters by one', () => {
    const lib = [loop('CAXIXI QUARTERS 90bpm'), loop('TAMBOURINE 2 AND 4 90bpm'), loop('Bongos_90_01'), loop('mystery'), loop('MARACAS 90bpm')];
    expect(instrumentList(lib)).toEqual(['Bongos', 'Shaker', 'Tambourine', 'Other']);
    const none = { folder: '', near: 0, bpm: 90, text: '' };
    expect(filterLoops(lib, { ...none, instrument: 'Shaker' }).map((l) => l.name)).toEqual(['CAXIXI QUARTERS 90bpm', 'MARACAS 90bpm']);
    expect(filterLoops(lib, { ...none, instrument: '' })).toHaveLength(5);
    expect(filterLoops(lib, none)).toHaveLength(5);
  });

  it('knows nearly all the real loop names on this machine (when the folders are present)', () => {
    const fs = require('fs');
    const dirs = ['loops/All loops flat FLAC 16 bit', 'loops/SHAKERZ flat FLAC 16 bit', 'loops/TAMBOREENE flat FLAC 16 bit', 'loops/shake Loops flat FLAC 16 bit'];
    const names: string[] = [];
    for (const d of dirs) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) names.push(f.replace(/\.[A-Za-z0-9]+$/, ''));
    if (names.length === 0) return;
    const other = names.filter((n) => instrumentOf(n) === 'Other');
    expect(other.length / names.length).toBeLessThan(0.08);
  });
});

describe('lane breathing', () => {
  it('the rule: steady, a cycle, with the drums, against the drums', () => {
    expect(laneMayPlay(0, true, true)).toBe(true);
    expect(laneMayPlay(1, false, true)).toBe(true);
    expect(laneMayPlay(1, true, false)).toBe(false);
    expect(laneMayPlay(2, false, false)).toBe(true);
    expect(laneMayPlay(2, false, true)).toBe(false);
    expect(laneMayPlay(3, false, true)).toBe(true);
    expect(laneMayPlay(3, false, false)).toBe(false);
  });

  it('the drums are out in the intro, in a breakdown, or when none is on', () => {
    expect(drumsAreOut(0, false, true)).toBe(false);
    expect(drumsAreOut(4, false, true)).toBe(true);
    expect(drumsAreOut(0, true, true)).toBe(true);
    expect(drumsAreOut(0, false, false)).toBe(true);
  });

  it('is off by default, saved per scene, and sent to the engine', () => {
    expect(defaultLanes()[0].breathe).toBe(0);
    const lib = JSON.stringify([{ id: 'S/x', name: 'x', folder: 'S', file: 'x.wav', seconds: 8, bpm: 120, bars: 4, repeats: 1 }]);
    const lanes = defaultLanes();
    lanes[0] = { ...lanes[0], loop: 'S/x', on: true, breathe: 2 };
    lanes[1] = { ...lanes[1], loop: 'S/x', on: true, breathe: 1, breatheOn: 6, breatheOff: 2, breatheChance: 70 };
    const out = lanesForEngine(lanes, lib, 100, 120);
    expect(out[0].breathe).toEqual({ mode: 2, onBars: 8, offBars: 4, chance: 100 });
    expect(out[1].breathe).toEqual({ mode: 1, onBars: 6, offBars: 2, chance: 70 });
    expect(out[2].breathe.mode).toBe(0);
    const s = { ...defaultState, lanes };
    const there = switchScene(switchScene(s, 1), 0);
    expect(there.lanes[1].breathe).toBe(1);
    expect(applyScene(s, s.scenes[0]).lanes[0].breathe).toBe(0);
  });

  it('older saved lanes get the defaults', () => {
    const old: any = JSON.parse(JSON.stringify(defaultState));
    for (const l of old.lanes) {
      delete l.breathe;
      delete l.breatheOn;
    }
    for (const sc of old.scenes) for (const l of sc.lanes) delete l.breathe;
    const m = migrateState(old);
    expect(m.lanes[0].breathe).toBe(0);
    expect(m.lanes[0].breatheOn).toBe(8);
    expect(m.scenes[1].lanes[2].breathe).toBe(0);
  });
});

describe('the last chord rings after the ending', () => {
  it('is off by default and sent as beats', () => {
    expect(defaultEnding.holdBeats).toBe(0);
    expect(JSON.parse(endingJson({ ...defaultEnding, style: 1, holdBeats: 8 })).holdBeats).toBe(8);
    expect(JSON.parse(endingJson({ ...defaultEnding, style: 1, holdBeats: 400 })).holdBeats).toBe(64);
  });
});

describe('keyboard actions and typing', () => {
  it('there is an action to switch the keyboard shortcuts on and off, with no letter key', () => {
    expect(MIDI_ACTIONS.some((a) => a.id === 'keyboardActions' && a.action.type === 'keyboardActions')).toBe(true);
    for (const k of 'abcdefghijklmnopqrstuvwxyz0123456789') expect(actionForKey(k)?.type).not.toBe('keyboardActions');
  });

  it('the screen ignores keys while a text field has the focus, and the native pieces exist', () => {
    const fs = require('fs');
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('currentlyFocusedInput');
    expect(app).toContain('if (isTyping()) return;');
    const engine = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(engine).toContain('private func laneMayPlay(');
    expect(engine).toContain('var breathe: MidiBedLaneBreathe?');
    expect(engine).toContain('var holdBeats: Double?');
    expect(engine).toContain('endHoldBeats');
  });
});
