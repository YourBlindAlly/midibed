import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';

describe('percussion master switch', () => {
  it('is on by default and sends every enabled drum', () => {
    expect(defaultState.percussion).toBe(true);
    const j = JSON.parse(toEngineJson(defaultState));
    expect(j.drums.every((d: { enabled: boolean }) => d.enabled)).toBe(true);
  });

  it('switches all drums off at once without touching each drum setting', () => {
    const live = { ...defaultState, percussion: false };
    const j = JSON.parse(toEngineJson(live));
    expect(j.drums.every((d: { enabled: boolean }) => !d.enabled)).toBe(true);
    expect(live.drums.every((d) => d.enabled)).toBe(true); // per-drum switches untouched
  });

  it('keeps a drum off when the master is on but that drum is off', () => {
    const live = { ...defaultState, drums: defaultState.drums.map((d) => (d.name === 'Hat' ? { ...d, enabled: false } : d)) };
    const j = JSON.parse(toEngineJson(live));
    expect(j.drums.map((d: { enabled: boolean }) => d.enabled)).toEqual([true, true, false, true]);
  });

  it('is remembered per scene', () => {
    const away = switchScene(defaultState, 3); // drone-only scene has percussion off
    expect(away.percussion).toBe(false);
    const back = switchScene(away, 0);
    expect(back.percussion).toBe(true);
  });

  it('does not lose individual drum switches when saved into a scene with percussion off', () => {
    const live = { ...defaultState, percussion: false };
    const away = switchScene(live, 1);
    const back = switchScene(away, 0);
    expect(back.percussion).toBe(false);
    expect(back.drums.every((d) => d.enabled)).toBe(true);
    expect(switchScene({ ...back, percussion: true }, 0)).toEqual({ ...back, percussion: true });
  });

  it('is added to old saved settings as on', () => {
    expect(migrateState({ bpm: 100 }).percussion).toBe(true);
  });
});
