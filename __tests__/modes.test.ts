import { MODE_INTERVALS, MODE_NAMES, PRESETS, clampMode, presetsForMode } from '../src/chords';
import { defaultState, migrateState } from '../src/config';

describe('modes', () => {
  it('has six modes and no Locrian', () => {
    expect(MODE_NAMES).toEqual(['Ionian (major)', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian (minor)']);
    expect(MODE_INTERVALS).toHaveLength(MODE_NAMES.length);
  });

  it('clamps a mode that no longer exists to the last one', () => {
    expect(clampMode(6)).toBe(5);
    expect(clampMode(40)).toBe(5);
    expect(clampMode(-3)).toBe(0);
    expect(clampMode(NaN)).toBe(0);
    expect(clampMode(2)).toBe(2);
  });

  it('a saved Locrian setting, live and in a scene, becomes Aeolian', () => {
    const s = migrateState({ harmony: { mode: 6 }, scenes: [{}, { harmony: { mode: 6 } }] });
    expect(s.harmony.mode).toBe(5);
    expect(s.scenes[1].harmony.mode).toBe(5);
  });
});

describe('mode-aware presets', () => {
  const names = (mode: number, current = 0) => presetsForMode(mode, current).map((i) => PRESETS[i].name);

  it('always offers Custom first', () => {
    for (let m = 0; m < MODE_NAMES.length; m++) expect(presetsForMode(m, 0)[0]).toBe(0);
  });

  it('a major key is offered major progressions and not the ones with a diminished seventh chord', () => {
    const n = names(0);
    expect(n).toEqual(expect.arrayContaining(['Four chords', 'Plain', 'Gentle turn', 'Lift', 'Pedal, one chord']));
    expect(n).not.toContain('Folk turn');
    expect(n).not.toContain('Rock between two');
  });

  it('Dorian and minor keep the folk progressions', () => {
    expect(names(1)).toContain('Folk turn');
    expect(names(5)).toEqual(expect.arrayContaining(['Folk turn', 'Descent', 'Fall']));
  });

  it('Lydian and Phrygian get their own', () => {
    expect(names(3)).toContain('Floating');
    expect(names(2)).toContain('Phrygian turn');
  });

  it('keeps the chosen preset in the list even when it does not suit the mode', () => {
    const folk = PRESETS.findIndex((p) => p.name === 'Folk turn');
    expect(presetsForMode(0, folk)).toContain(folk);
    expect(presetsForMode(0, 0)).not.toContain(folk);
  });

  it('every tag is a real mode, every progression uses degrees 1 to 7, and old numbers did not move', () => {
    PRESETS.forEach((p) => {
      (p.modes ?? []).forEach((m) => expect(m).toBeLessThan(MODE_NAMES.length));
      p.degrees.forEach((d) => {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(7);
      });
    });
    expect(PRESETS[5].name).toBe('Folk turn'); // the saved default must keep its number
    expect(defaultState.harmony.preset).toBe(5);
  });
});
