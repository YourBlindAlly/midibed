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

describe('transition settings are global, with a per-scene switch', () => {
  it('start with only the drums-break boom on', () => {
    expect(defaultTransitions.entrance.on).toBe(false);
    expect(defaultTransitions.drumReturn.on).toBe(false);
    expect(defaultTransitions.drumBreak).toMatchObject({ on: true, shape: 3 }); // Boom
  });

  it('every scene uses the sounds unless it switches them off', () => {
    expect(defaultState.transitionUse).toEqual({ entrance: true, drumBreak: true, drumReturn: true });
    expect(defaultState.scenes.every((sc) => sc.transitionUse.entrance && sc.transitionUse.drumBreak && sc.transitionUse.drumReturn)).toBe(true);
  });

  it('are sent to the engine with level as 0 to 1 and the minimum in beats', () => {
    const live = {
      ...defaultState,
      transitionMinEighths: 1,
      transitions: { ...defaultState.transitions, entrance: { on: true, shape: 0, color: 2, beats: 8, level: 20 } },
    };
    const j = JSON.parse(toEngineJson(live));
    expect(j.transitions.minLeadBeats).toBe(0.5);
    expect(j.transitions.entrance).toEqual({ on: true, shape: 0, color: 2, beats: 8, level: 0.2 });
    expect(j.transitions.drumBreak.on).toBe(true);
    expect(j.transitions.drumReturn.on).toBe(false);
  });

  it('a scene that switches a sound off silences it there, but not in other scenes', () => {
    const on = { ...defaultState, transitions: { ...defaultState.transitions, drumReturn: { ...defaultState.transitions.drumReturn, on: true } } };
    expect(JSON.parse(toEngineJson(on)).transitions.drumReturn.on).toBe(true);
    const muted = { ...on, transitionUse: { ...on.transitionUse, drumReturn: false } };
    expect(JSON.parse(toEngineJson(muted)).transitions.drumReturn.on).toBe(false);
    const away = switchScene(muted, 1);
    expect(away.transitionUse.drumReturn).toBe(true); // scene 2 still uses it
    expect(JSON.parse(toEngineJson(away)).transitions.drumReturn.on).toBe(true);
    expect(switchScene(away, 0).transitionUse.drumReturn).toBe(false);
  });

  it('a sound that is off globally stays off even if the scene would use it', () => {
    const j = JSON.parse(toEngineJson(defaultState));
    expect(j.transitions.entrance.on).toBe(false);
    expect(defaultState.transitionUse.entrance).toBe(true);
  });

  it('the sounds are the same in every scene (they are not saved per scene)', () => {
    const live = { ...defaultState, transitions: { ...defaultState.transitions, entrance: { on: true, shape: 4, color: 0, beats: 8, level: 30 } } };
    const away = switchScene(live, 1);
    expect(away.transitions.entrance).toEqual({ on: true, shape: 4, color: 0, beats: 8, level: 30 });
    expect(Object.keys(defaultState.scenes[0])).not.toContain('transitions');
    expect(Object.keys(defaultState.scenes[0])).toContain('transitionUse');
  });

  it('fill in for old saved settings', () => {
    const s = migrateState({ bpm: 100 });
    expect(s.transitions.entrance.on).toBe(false);
    expect(s.transitionMinEighths).toBe(1);
    expect(s.noiseVersion).toBe(2);
    expect(s.transitionUse.drumBreak).toBe(true);
  });
});

describe('upgrading levels saved before the level scale changed', () => {
  const old = {
    transitions: {
      entrance: { on: true, shape: 1, color: 1, beats: 4, level: 5 },
      drumReturn: { on: true, shape: 3, color: 0, beats: 2, level: 50 },
    },
  };

  it('multiplies noise-shape levels by 5 and leaves the Boom alone', () => {
    const s = migrateState(old);
    expect(s.transitions.entrance.level).toBe(25); // 5 -> 25
    expect(s.transitions.drumReturn.level).toBe(50); // Boom unchanged
    expect(s.transitions.entrance.beats).toBe(4); // other settings kept
  });

  it('never goes above 100', () => {
    const s = migrateState({ transitions: { entrance: { on: true, shape: 0, color: 0, beats: 4, level: 60 } } });
    expect(s.transitions.entrance.level).toBe(100);
  });

  it('does it only once: already-upgraded settings are left as they are', () => {
    const once = migrateState(old);
    const twice = migrateState(JSON.parse(JSON.stringify(once)));
    expect(twice.transitions.entrance.level).toBe(25);
  });
});
