import { SCENE_COPY_PARTS, copyScene, copyScenePart, defaultState, migrateState, renameScene, sceneLabel, switchJourney, switchScene, newJourney } from '../src/config';

const named = (s: typeof defaultState, name: string) => renameScene(s, name);

describe('scene names', () => {
  it('are optional: no name reads "Scene 2", a name reads "Scene 2, the lift"', () => {
    expect(sceneLabel(defaultState, 1)).toBe('Scene 2');
    const s = switchScene(named(switchScene(defaultState, 1), 'the lift'), 0);
    expect(sceneLabel(s, 1)).toBe('Scene 2, the lift');
    expect(sceneLabel(s, 0)).toBe('Scene 1');
  });

  it('belong to the scene, follow it through switches, and are cut to 30 characters', () => {
    let s = named(defaultState, 'x'.repeat(50));
    expect(s.sceneName).toHaveLength(30);
    s = switchScene(named(defaultState, 'intro'), 2);
    expect(s.sceneName).toBe('');
    s = switchScene(s, 0);
    expect(s.sceneName).toBe('intro');
  });

  it('stay with the journey: another journey has its own scene names', () => {
    let s = named(defaultState, 'intro');
    s = newJourney(s);
    expect(sceneLabel(s, 0)).toBe('Scene 1');
    s = switchJourney(s, 0);
    expect(sceneLabel(s, 0)).toBe('Scene 1, intro');
  });

  it('are filled in for settings saved before they existed', () => {
    const s = migrateState({});
    expect(s.sceneName).toBe('');
    expect(s.scenes.every((sc) => sc.name === '')).toBe(true);
  });
});

describe('copying a part of a scene', () => {
  const base = () => {
    // Scene 1 (active): drums changed, a pad setting changed, named. Scene 2 has its own name.
    let s = switchScene(named(defaultState, 'groove'), 1);
    s = named(s, 'the lift');
    s = switchScene(s, 0);
    return {
      ...s,
      drums: s.drums.map((d, i) => (i === 1 ? { ...d, hits: 7, ghostHits: 5 } : d)),
      pad: { ...s.pad, velocity: 33 },
    };
  };

  it('copies only the chosen part and leaves the rest of the other scene alone', () => {
    const s = base();
    const before = s.scenes[1];
    const out = copyScenePart(s, 1, 1); // drums
    expect(out.scenes[1].drums[1]).toMatchObject({ hits: 7, ghostHits: 5 });
    expect(out.scenes[1].pad).toEqual(before.pad);
    expect(out.scenes[1].name).toBe('the lift');
    const pad = copyScenePart(s, 1, 3);
    expect(pad.scenes[1].pad.velocity).toBe(33);
    expect(pad.scenes[1].drums).toEqual(before.drums);
  });

  it('keeps the live scene as it is (its edits are saved into its slot) and does not share objects', () => {
    const s = base();
    const out = copyScenePart(s, 1, 1);
    expect(out.scenes[0].drums[1].hits).toBe(7);
    out.scenes[1].drums[1].hits = 2;
    expect(out.scenes[0].drums[1].hits).toBe(7);
  });

  it('everything copies the scene but keeps the target scene\'s own name', () => {
    const s = base();
    const out = copyScenePart(s, 1, 0);
    expect(out.scenes[1].pad.velocity).toBe(33);
    expect(out.scenes[1].name).toBe('the lift');
    expect(copyScene(s, 1).scenes[1].name).toBe('the lift');
  });

  it('does nothing to the active scene or an unknown scene', () => {
    const s = base();
    expect(copyScenePart(s, 0, 1)).toBe(s);
    expect(copyScenePart(s, 9, 1)).toBe(s);
    expect(SCENE_COPY_PARTS[0]).toBe('Everything');
  });
});
