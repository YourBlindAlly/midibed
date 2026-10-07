import { addFavorite, defaultState, migrateState, parseFavorites, removeFavorite } from '../src/config';

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

  it('ships the chord pad slot with the Synth One pad presets', () => {
    const pad = defaultState.sounds.find((s) => s.name === 'Chord pad');
    expect(pad?.channel).toBe(1);
    expect(parseFavorites(pad?.favorites ?? '')).toEqual([12, 16, 20, 26, 39, 55, 63, 75, 80, 82, 99, 113]);
  });

  it('adds the new slot to old saved settings and keeps their existing slots in place', () => {
    const old = { sounds: [{ name: 'Drone synth', program: 7 }, { name: 'Percussion', channel: 9 }] };
    const s = migrateState(old);
    expect(s.sounds).toHaveLength(3);
    expect(s.sounds[0].program).toBe(7);
    expect(s.sounds[0].favorites).toBe('');
    expect(s.sounds[2].name).toBe('Chord pad');
  });
});
