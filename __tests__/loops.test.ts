import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';

describe('loops layer and clock', () => {
  it('starts switched off, with no start control, and the clock off', () => {
    expect(defaultState.loops.enabled).toBe(false);
    expect(defaultState.loops.startCC).toBe(0);
    expect(defaultState.clock).toBe(false);
  });

  it('sends loop settings and clock to the engine, with no bank when bank select is off', () => {
    const live = { ...defaultState, clock: true, loops: { ...defaultState.loops, enabled: true, program: 7, startCC: 118, stopCC: 117 } };
    const j = JSON.parse(toEngineJson(live));
    expect(j.clock).toBe(true);
    expect(j.loops).toEqual({ enabled: true, channel: 2, program: 7, bankMSB: -1, bankLSB: -1, startCC: 118, stopCC: 117, ownPort: false });
  });

  it('sends bank numbers only when bank select is on', () => {
    const live = { ...defaultState, loops: { ...defaultState.loops, sendBank: true, bankMSB: 3, bankLSB: 9 } };
    const j = JSON.parse(toEngineJson(live));
    expect(j.loops.bankMSB).toBe(3);
    expect(j.loops.bankLSB).toBe(9);
  });

  it('remembers which loop and whether it plays per scene, but not the routing', () => {
    const live = {
      ...defaultState,
      loops: { ...defaultState.loops, enabled: true, program: 12, channel: 4, startCC: 118, stopCC: 117 },
    };
    const away = switchScene(live, 1);
    expect(away.loops.enabled).toBe(false); // scene 2 has loops off
    expect(away.loops.channel).toBe(4); // routing unchanged
    expect(away.loops.startCC).toBe(118);
    const back = switchScene(away, 0);
    expect(back.loops.enabled).toBe(true);
    expect(back.loops.program).toBe(12);
  });

  it('adds loops and clock to old saved settings', () => {
    const s = migrateState({ bpm: 90 });
    expect(s.loops.enabled).toBe(false);
    expect(s.clock).toBe(false);
    expect(s.scenes.every((sc) => sc.loops.enabled === false)).toBe(true);
    expect(s.profiles.loops).toBe('drumjam');
  });
});

describe('loops on their own MIDI port', () => {
  it('is off by default, global (not in a scene), and sent to the engine', () => {
    expect(defaultState.loops.ownPort).toBe(false);
    const on = { ...defaultState, loops: { ...defaultState.loops, ownPort: true } };
    expect(JSON.parse(toEngineJson(on)).loops.ownPort).toBe(true);
    const away = switchScene(on, 1);
    expect(away.loops.ownPort).toBe(true);
    expect(switchScene(away, 0).loops.ownPort).toBe(true);
  });
});
