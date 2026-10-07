import { defaultState, migrateState } from '../src/config';
import { PROFILES, ccName, getProfile, profileForChannel, profileIndex, stepDrumNote } from '../src/profiles';

describe('device profiles', () => {
  it('has unique ids and valid numbers', () => {
    const ids = PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    PROFILES.forEach((p) => {
      const ccs = p.ccs.map((c) => c.cc);
      expect(new Set(ccs).size).toBe(ccs.length);
      ccs.forEach((c) => {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(127);
      });
      (p.drumNotes ?? []).forEach((n) => {
        expect(n.note).toBeGreaterThanOrEqual(0);
        expect(n.note).toBeLessThanOrEqual(127);
      });
      if (p.fadeCC !== undefined) {
        expect(p.fadeCC).toBeGreaterThan(0);
        expect(p.fadeCC).toBeLessThanOrEqual(127);
      }
    });
  });

  it('falls back to no profile for an unknown id', () => {
    expect(getProfile('nope').id).toBe('none');
    expect(profileIndex('nope')).toBe(0);
  });

  it('knows the DrumJam filter controls MidiBed uses by default', () => {
    const dj = getProfile('drumjam');
    expect(ccName(dj, 74)).toBe('Pad filter cutoff');
    expect(ccName(dj, 71)).toBe('Pad filter resonance');
    expect(ccName(dj, 99)).toBeUndefined();
  });

  it('flags the Model D as monophonic and AUM as a CC 7 fade target', () => {
    expect(getProfile('modeld').mono).toBe(true);
    expect(getProfile('aum').fadeCC).toBe(7);
  });

  it('keeps the Synth One pad presets', () => {
    expect(getProfile('synthone').favorites).toBe('12,16,20,26,39,55,63,75,80,82,99,113');
  });

  it('picks the profile by what is routed to a channel', () => {
    const s = { ...defaultState, profiles: { drums: 'drumjam', drone: 'modeld', pad: 'synthone' } };
    expect(profileForChannel(s, 9).id).toBe('drumjam'); // drum channel
    expect(profileForChannel(s, 0).id).toBe('modeld'); // drone channel
    expect(profileForChannel(s, 1).id).toBe('synthone'); // pad channel
    expect(profileForChannel(s, 5).id).toBe('none'); // nothing routed there
  });

  it('steps drum notes between named GM drums only', () => {
    const gm = getProfile('gm');
    expect(stepDrumNote(gm, 36, 1)).toBe(37);
    expect(stepDrumNote(gm, 87, 1)).toBe(87);
    expect(stepDrumNote(gm, 35, -1)).toBe(35);
    expect(stepDrumNote(gm, 20, 1)).toBe(35); // from below the list jumps to its first note
    expect(stepDrumNote(gm, 100, -1)).toBe(87);
    expect(stepDrumNote(getProfile('none'), 60, 1)).toBe(61);
  });

  it('keeps profile choices in saved settings and fills them for old saves', () => {
    expect(migrateState({}).profiles).toEqual(defaultState.profiles);
    expect(migrateState({ profiles: { drums: 'drumjam' } }).profiles.drums).toBe('drumjam');
    expect(migrateState({ profiles: { drums: 'drumjam' } }).profiles.pad).toBe('synthone');
  });
});
