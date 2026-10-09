import { addFavorite, applyFavorite, defaultState, migrateState, parseFavorites, removeFavorite, slotProfileId, switchScene, toEngineJson } from '../src/config';
import { addFav, favLabel, favsFor, removeFav, sameFavorite } from '../src/soundFavs';

describe('sound favorites', () => {
  it('parses, de-duplicates, sorts and drops invalid numbers', () => {
    expect(parseFavorites('39, 12,12,abc,200,-1, ,16')).toEqual([12, 16, 39]);
    expect(parseFavorites('')).toEqual([]);
  });

  it('adds and removes a program', () => {
    expect(addFavorite('12,16', 14)).toBe('12,14,16');
    expect(addFavorite('', 5)).toBe('5');
    expect(addFavorite('12,16', 16)).toBe('12,16');
    expect(removeFavorite('12,14,16', 14)).toBe('12,16');
    expect(removeFavorite('12', 12)).toBe('');
  });

  it('ships the Synth One pad presets as Synth One favorites, not on the slot', () => {
    const pad = defaultState.sounds.find((s) => s.name === 'Chord pad');
    expect(pad?.channel).toBe(1);
    expect(pad?.favorites).toBe('');
    expect(favsFor(defaultState.soundFavs, 'synthone').map((f) => f.program)).toEqual([12, 16, 20, 26, 39, 55, 63, 75, 80, 82, 99, 113]);
  });

  it('adds the new slot to old saved settings and keeps their existing slots in place', () => {
    const old = { sounds: [{ name: 'Drone synth', program: 7 }, { name: 'Percussion', channel: 9 }] };
    const s = migrateState(old);
    expect(s.sounds).toHaveLength(3);
    expect(s.sounds[0].program).toBe(7);
    expect(s.sounds[0].favorites).toBe('');
    expect(s.sounds[2].name).toBe('Chord pad');
    expect(s.sounds[0].name).toBe('Bass drone'); // the old saved name 'Drone synth' is replaced
  });
});

describe('sound favorites per app, with banks and names', () => {
  const j6 = (program: number, msb: number, name = '') => ({ name, program, sendBank: true, bankMSB: msb, bankLSB: 0 });

  it('keeps the same program in two banks as two favorites', () => {
    let json = '{}';
    json = addFav(json, 'j6', j6(12, 1, 'Warm pad'));
    json = addFav(json, 'j6', j6(12, 2));
    const list = favsFor(json, 'j6');
    expect(list).toHaveLength(2);
    expect(list.map((f) => f.bankMSB)).toEqual([1, 2]);
    expect(list[0].name).toBe('Warm pad');
  });

  it('adding the same sound again keeps one entry and can name it', () => {
    let json = addFav('{}', 'j6', j6(5, 3));
    json = addFav(json, 'j6', j6(5, 3, 'Glass'));
    expect(favsFor(json, 'j6')).toHaveLength(1);
    expect(favsFor(json, 'j6')[0].name).toBe('Glass');
  });

  it('are separate for each app', () => {
    const json = addFav('{}', 'j6', j6(7, 1));
    expect(favsFor(json, 'synthone')).toHaveLength(0);
    expect(favsFor(json, 'j6')).toHaveLength(1);
  });

  it('removes only the matching bank', () => {
    let json = addFav(addFav('{}', 'j6', j6(12, 1)), 'j6', j6(12, 2));
    json = removeFav(json, 'j6', j6(12, 1));
    expect(favsFor(json, 'j6').map((f) => f.bankMSB)).toEqual([2]);
  });

  it('sameFavorite ignores the name, and the bank when no bank is sent', () => {
    expect(sameFavorite(j6(1, 1, 'a'), j6(1, 1, 'b'))).toBe(true);
    expect(sameFavorite(j6(1, 1), j6(1, 2))).toBe(false);
    expect(sameFavorite({ name: '', program: 4, sendBank: false, bankMSB: 9, bankLSB: 9 }, { name: '', program: 4, sendBank: false, bankMSB: 0, bankLSB: 0 })).toBe(true);
  });

  it('survives bad saved data', () => {
    expect(favsFor('not json', 'j6')).toEqual([]);
    expect(favsFor('{"j6":[{"program":"x"},{"program":300,"sendBank":true,"bankMSB":-4}, 7, null]}', 'j6')).toEqual([
      { name: '', program: 127, sendBank: true, bankMSB: 0, bankLSB: 0 },
    ]);
  });

  it('says the bank when speaking a favorite', () => {
    expect(favLabel(j6(12, 2, 'Warm pad'), false)).toBe('Warm pad, bank 2, program 12');
    expect(favLabel({ name: '', program: 3, sendBank: false, bankMSB: 0, bankLSB: 0 })).toBe('program 3');
  });

  it('choosing a favorite sets the slot program and bank', () => {
    const s = applyFavorite(defaultState, 2, j6(44, 5));
    expect(s.sounds[2]).toMatchObject({ program: 44, sendBank: true, bankMSB: 5 });
    expect(s.sounds[0]).toEqual(defaultState.sounds[0]);
  });

  it('finds the app a slot talks to from its role', () => {
    expect(slotProfileId(defaultState, 'Chord pad')).toBe('synthone');
    expect(slotProfileId({ profiles: { ...defaultState.profiles, pad: 'j6' } }, 'Chord pad')).toBe('j6');
  });

  it('lifts favorites saved on a slot into the app it talks to, then clears the slot', () => {
    const old = { sounds: [{ name: 'Bass drone' }, { name: 'Percussion' }, { name: 'Chord pad', favorites: '7,9' }], profiles: { pad: 'j6' } };
    const s = migrateState(old);
    expect(favsFor(s.soundFavs, 'j6').map((f) => f.program)).toEqual([7, 9]);
    expect(s.sounds[2].favorites).toBe('');
    // running it again changes nothing
    expect(migrateState(JSON.parse(JSON.stringify(s))).soundFavs).toBe(s.soundFavs);
  });

  it('the J6 profile switches banks with MSB only', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getProfile } = require('../src/profiles');
    expect(getProfile('j6').bankUsesLSB).toBe(false);
    expect(getProfile('synthone').bankUsesLSB).toBeUndefined();
  });
});

describe('your own apps and MIDI ports', () => {
  it('a user-added app becomes a profile with its own favorites', () => {
    const { addCustomApp, allProfiles, getProfile, parseCustomApps, removeCustomApp, setCustomApps } = require('../src/profiles');
    const r = addCustomApp('[]', '  Cool Synth  ', 1234);
    expect(r.id).toMatch(/^custom-/);
    setCustomApps(parseCustomApps(r.json));
    expect(getProfile(r.id).name).toBe('Cool Synth');
    expect(allProfiles().some((p: { id: string }) => p.id === r.id)).toBe(true);
    const json = addFav('{}', r.id, { name: '', program: 3, sendBank: false, bankMSB: 0, bankLSB: 0 });
    expect(favsFor(json, r.id)).toHaveLength(1);
    expect(favsFor(json, 'synthone')).toHaveLength(0);
    const removed = removeCustomApp(r.json, r.id);
    setCustomApps(parseCustomApps(removed));
    expect(getProfile(r.id).id).toBe('none'); // unknown ids fall back to No profile
  });

  it('ignores bad saved app lists and caps the number', () => {
    const { parseCustomApps, addCustomApp } = require('../src/profiles');
    expect(parseCustomApps('nope')).toEqual([]);
    expect(parseCustomApps('[{"id":"x","name":"bad"},{"id":"custom-a","name":"ok"}]')).toEqual([{ id: 'custom-a', name: 'ok' }]);
    let json = '[]';
    for (let i = 0; i < 25; i++) json = addCustomApp(json, `A${i}`, i).json;
    expect(parseCustomApps(json)).toHaveLength(20);
  });

  it('MIDI ports are off by default, global, and sent to the engine', () => {
    expect(defaultState.ports).toEqual({ bass: false, pad: false, dancer: false, drums: false });
    const on = { ...defaultState, ports: { bass: true, pad: false, dancer: true, drums: false } };
    expect(JSON.parse(toEngineJson(on)).ports).toEqual({ bass: true, pad: false, dancer: true, drums: false });
    expect(switchScene(on, 1).ports.bass).toBe(true);
  });

  it('old saved settings get the new fields', () => {
    const s = migrateState({ bpm: 80 });
    expect(s.ports.pad).toBe(false);
    expect(s.customApps).toBe('[]');
  });
});
