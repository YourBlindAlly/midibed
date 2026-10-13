import { defaultFill, describeFill, fillLengths, fillPalette, planFill } from '../src/fill';
import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';
import { actionForKey } from '../src/shortcuts';
import { MIDI_ACTIONS } from '../src/midicontrol';
import { mulberry32 } from '../src/dancer';

const pal = fillPalette(defaultState.drums);

describe('which drums a fill uses', () => {
  it('takes snare and tom sounds, whether or not the slot is on in the pattern', () => {
    // starting set: Kick, Snare (snare sound), Hat, Shaker, Tambourine, Low/Mid/High tom (switched off)
    expect(pal.map((v) => v.role).sort()).toEqual([0, 1, 2, 3]);
    expect(pal.map((v) => v.note).sort((a, b) => a - b)).toEqual([38, 45, 47, 50]);
  });
});

describe('the shape of a fill', () => {
  it('always ends with a pick-up on the last sixteenth and a hit on the downbeat', () => {
    for (let s = 1; s < 30; s++) {
      const f = planFill(8, 0.5, pal, mulberry32(s))!;
      expect(f.hits[f.hits.length - 1].step).toBe(7);
      expect(f.final.step).toBe(8);
      expect(new Set(f.hits.map((h) => h.step)).size).toBe(f.hits.length); // no two on one step
    }
  });

  it('density sets how many sixteenths are played', () => {
    const count = (d: number) => planFill(8, d, pal, mulberry32(3))!.hits.length;
    expect(count(0)).toBe(2);
    expect(count(1)).toBe(8);
    expect(count(0.5)).toBeGreaterThan(count(0));
    expect(count(0.5)).toBeLessThan(count(1));
  });

  it('is a mix of snare and toms, and the toms fall from high to low', () => {
    let sawSnare = false;
    let sawTom = false;
    for (let s = 1; s < 40; s++) {
      const f = planFill(8, 1, pal, mulberry32(s))!;
      const roles = f.hits.map((h) => pal[h.voice].role);
      if (roles.includes(0)) sawSnare = true;
      if (roles.some((r) => r > 0)) sawTom = true;
      const toms = roles.filter((r) => r > 0);
      for (let i = 1; i < toms.length; i++) expect(toms[i]).toBeGreaterThanOrEqual(toms[i - 1]);
    }
    expect(sawSnare && sawTom).toBe(true);
  });

  it('gets louder through the fill, and stays inside 1..127', () => {
    for (let s = 1; s < 30; s++) {
      const f = planFill(8, 1, pal, mulberry32(s))!;
      f.hits.forEach((h) => {
        expect(h.velocity).toBeGreaterThanOrEqual(1);
        expect(h.velocity).toBeLessThanOrEqual(127);
      });
    }
    // across many fills the last hit before the downbeat is louder on average than the first
    let first = 0;
    let last = 0;
    for (let s = 1; s < 60; s++) {
      const f = planFill(8, 1, pal, mulberry32(s))!;
      first += f.hits[0].velocity;
      last += f.hits[f.hits.length - 1].velocity;
    }
    expect(last).toBeGreaterThan(first);
  });

  it('is a different pattern each time, and works with only snares, only toms, or nothing', () => {
    const a = JSON.stringify(planFill(8, 0.6, pal, mulberry32(1)));
    const b = JSON.stringify(planFill(8, 0.6, pal, mulberry32(2)));
    expect(a).not.toBe(b);
    expect(planFill(8, 0.6, pal.filter((v) => v.role === 0), mulberry32(1))!.hits.length).toBeGreaterThan(1);
    expect(planFill(8, 0.6, pal.filter((v) => v.role > 0), mulberry32(1))!.hits.length).toBeGreaterThan(1);
    expect(planFill(8, 0.6, [], mulberry32(1))).toBeNull();
  });

  it('lengths are within the last two beats', () => {
    expect(fillLengths(2)).toEqual([4, 6, 8]);
    expect(fillLengths(1)).toEqual([4]);
  });
});

describe('settings', () => {
  it('are off by default, saved per scene, and sent to the engine in 0-1 units with the palette', () => {
    expect(defaultState.fill).toEqual(defaultFill);
    expect(defaultFill.enabled).toBe(false);
    const on = { ...defaultState, fill: { ...defaultFill, enabled: true, density: 80, chance: 40, everyBars: 4 } };
    const j = JSON.parse(toEngineJson(on)).fill;
    expect(j).toMatchObject({ enabled: true, everyBars: 4, density: 0.8, chance: 0.4, maxBeats: 2 });
    expect(j.palette).toHaveLength(4);
    expect(switchScene(switchScene(on, 1), 0).fill.density).toBe(80);
    expect(switchScene(on, 1).fill.enabled).toBe(false);
    expect(migrateState({ bpm: 90 }).fill).toEqual(defaultFill);
  });

  it('can be asked for with a key and from a MIDI controller', () => {
    expect(actionForKey('u')).toEqual({ type: 'fill' });
    expect(MIDI_ACTIONS.find((a) => a.id === 'fill')?.action).toEqual({ type: 'fill' });
  });

  it('describes itself in a sentence', () => {
    expect(describeFill(defaultFill, 4)).toBe('Fills are off');
    expect(describeFill({ ...defaultFill, enabled: true }, 0)).toContain('nothing to fill with');
    expect(describeFill({ ...defaultFill, enabled: true }, 4)).toBe('A fill every 8 bars, before a scene change, as the drums come back, and when you ask, 70 percent of the time');
  });
});
