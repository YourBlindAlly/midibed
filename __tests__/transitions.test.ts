import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';
import { NOISE_SHAPE_NAMES, defaultTransitions, eighthsText, isLeadIn, planTransition } from '../src/transitions';

describe('transition names and kinds', () => {
  it('uses Rusty\'s names', () => {
    expect(NOISE_SHAPE_NAMES).toEqual(['Wave', 'Wind', 'Thunder', 'Boom', 'Crash']);
  });
  it('Wave and Wind lead in; Thunder, Boom and Crash play on the bar', () => {
    expect([0, 1, 2, 3, 4].map(isLeadIn)).toEqual([true, true, false, false, false]);
  });
  it('describes the shortest lead-in in musical terms', () => {
    expect(eighthsText(0)).toBe('no minimum');
    expect(eighthsText(1)).toBe('an eighth note');
    expect(eighthsText(2)).toBe('a beat (two eighth notes)');
    expect(eighthsText(3)).toBe('3 eighth notes');
  });
});

describe('what to play when the bar is close (the late-trigger rule)', () => {
  const min = 0.5; // an eighth note = half a beat

  it('plays a lead-in in full when there is plenty of room', () => {
    expect(planTransition(1, 4, 4, min)).toEqual({ shape: 1, offsetBeats: 0, mode: 'full' });
    expect(planTransition(1, 2, 3.5, min)).toEqual({ shape: 1, offsetBeats: 0, mode: 'full' });
  });

  it('joins the sweep part-way when there is less room than its full rise, but at least the minimum', () => {
    expect(planTransition(1, 4, 2, min)).toEqual({ shape: 1, offsetBeats: 2, mode: 'partial' });
    expect(planTransition(0, 4, 0.5, min)).toEqual({ shape: 0, offsetBeats: 3.5, mode: 'partial' });
  });

  it('with less room than the minimum, Wave plays only its falling half on the bar', () => {
    expect(planTransition(0, 4, 0.4, min)).toEqual({ shape: 0, offsetBeats: 4, mode: 'downer' });
  });

  it('with less room than the minimum, Wind is replaced by a Crash on the bar', () => {
    expect(planTransition(1, 4, 0.25, min)).toEqual({ shape: 4, offsetBeats: 0, mode: 'downer' });
  });

  it('sounds that play on the bar are never skipped or moved', () => {
    [2, 3, 4].forEach((shape) => {
      expect(planTransition(shape, 0, 0.1, min)).toEqual({ shape, offsetBeats: 0, mode: 'onbar' });
    });
  });

  it('a minimum of zero never skips a lead-in', () => {
    expect(planTransition(1, 4, 0.1, 0).mode).toBe('partial');
  });
});

describe('transition settings', () => {
  it('start switched off', () => {
    expect(defaultTransitions.entrance.on).toBe(false);
    expect(defaultTransitions.drumReturn.on).toBe(false);
  });

  it('are sent to the engine with level as 0 to 1 and the minimum in beats', () => {
    const live = {
      ...defaultState,
      transitionMinEighths: 1,
      transitions: { ...defaultState.transitions, entrance: { on: true, shape: 0, color: 2, beats: 3, level: 80 } },
    };
    const j = JSON.parse(toEngineJson(live));
    expect(j.transitions.minLeadBeats).toBe(0.5);
    expect(j.transitions.entrance).toEqual({ on: true, shape: 0, color: 2, beats: 3, level: 0.8 });
    expect(j.transitions.drumReturn.on).toBe(false);
  });

  it('belong to each scene, while the shortest lead-in is shared by all', () => {
    const live = {
      ...defaultState,
      transitionMinEighths: 2,
      transitions: { ...defaultState.transitions, entrance: { on: true, shape: 4, color: 0, beats: 2, level: 50 } },
    };
    const away = switchScene(live, 1);
    expect(away.transitions.entrance.on).toBe(false);
    expect(away.transitionMinEighths).toBe(2);
    expect(switchScene(away, 0).transitions.entrance).toEqual({ on: true, shape: 4, color: 0, beats: 2, level: 50 });
  });

  it('fill in for old saved settings', () => {
    const s = migrateState({ bpm: 100 });
    expect(s.transitions.entrance.on).toBe(false);
    expect(s.transitionMinEighths).toBe(1);
    expect(s.scenes.every((sc) => sc.transitions.drumReturn.on === false)).toBe(true);
  });
});
