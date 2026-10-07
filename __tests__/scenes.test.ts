import { SCENE_COUNT, captureScene, copyScene, defaultState, migrateState, switchScene, toEngineJson } from '../src/config';

describe('scenes', () => {
  it('starts with four different scenes', () => {
    expect(defaultState.scenes).toHaveLength(SCENE_COUNT);
    const keys = defaultState.scenes.map((s) => JSON.stringify(s));
    expect(new Set(keys).size).toBe(SCENE_COUNT);
  });

  it('switching never changes tempo, drone root, routing, fades or outputs', () => {
    const live = { ...defaultState, bpm: 101, drone: { ...defaultState.drone, root: 41, channel: 3 } };
    for (let to = 1; to < SCENE_COUNT; to++) {
      const next = switchScene(live, to);
      expect(next.bpm).toBe(101);
      expect(next.drone.root).toBe(41);
      expect(next.drone.channel).toBe(3);
      expect(next.pad.channel).toBe(live.pad.channel);
      expect(next.drums.map((d) => [d.note, d.channel])).toEqual(live.drums.map((d) => [d.note, d.channel]));
      expect(next.wanderers.map((w) => [w.cc, w.channel])).toEqual(live.wanderers.map((w) => [w.cc, w.channel]));
      expect(next.fade).toEqual(live.fade);
      expect(next.midiOut).toBe(live.midiOut);
      expect(next.activeScene).toBe(to);
    }
  });

  it('actually changes the musical content', () => {
    const next = switchScene(defaultState, 3); // drone only
    expect(next.drums.every((d) => !d.enabled)).toBe(true);
    expect(next.pad.enabled).toBe(false);
    expect(next.drone.enabled).toBe(true);
    const json = JSON.parse(toEngineJson(next));
    expect(json.pad.enabled).toBe(false);
  });

  it('saves edits into the scene you leave and restores them on return', () => {
    const edited = { ...defaultState, drums: defaultState.drums.map((d) => (d.name === 'Kick' ? { ...d, hits: 7 } : d)) };
    const away = switchScene(edited, 1);
    expect(away.drums[0].hits).toBe(defaultState.scenes[1].drums[0].hits);
    const back = switchScene(away, 0);
    expect(back.drums[0].hits).toBe(7);
  });

  it('copies the current scene, with unsaved edits, over another', () => {
    const edited = { ...defaultState, swing: 40 };
    const copied = copyScene(edited, 2);
    expect(copied.scenes[2].swing).toBe(40);
    expect(copied.activeScene).toBe(0);
    expect(copied.scenes[0].swing).toBe(40);
    expect(copyScene(edited, 0)).toBe(edited); // copying onto itself does nothing
    expect(copyScene(edited, 9)).toBe(edited);
  });

  it('ignores a switch to the current or an invalid scene', () => {
    expect(switchScene(defaultState, 0)).toBe(defaultState);
    expect(switchScene(defaultState, 7)).toBe(defaultState);
    expect(switchScene(defaultState, -1)).toBe(defaultState);
  });

  it('upgrades old saved settings without scenes and keeps live values', () => {
    const s = migrateState({ bpm: 120, swing: 33, pad: { strumMs: 90 } });
    expect(s.bpm).toBe(120);
    expect(s.scenes).toHaveLength(SCENE_COUNT);
    expect(s.activeScene).toBe(0);
    // The stored active scene is refreshed from the live settings.
    expect(s.scenes[0].swing).toBe(33);
    expect(s.scenes[0].pad.strumMs).toBe(90);
  });

  it('survives a bad saved active scene', () => {
    expect(migrateState({ activeScene: 99 }).activeScene).toBe(SCENE_COUNT - 1);
    expect(migrateState({ activeScene: -4 }).activeScene).toBe(0);
  });

  it('captures only scene-owned fields', () => {
    const sc = captureScene(defaultState);
    expect(sc).not.toHaveProperty('bpm');
    expect(sc.drone).not.toHaveProperty('root');
    expect(sc.pad).not.toHaveProperty('channel');
    expect(sc.drums[0]).not.toHaveProperty('note');
  });
});
