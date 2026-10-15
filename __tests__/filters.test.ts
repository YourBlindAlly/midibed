import { FILTER_FOCUS_NAMES, FILTER_PRESETS, filterTargetsJson, focusIncludes, hzToCc, nextFilterFocus, nextFilterPreset, presetOwnsChannel } from '../src/filters';
import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';
import { actionForKey } from '../src/shortcuts';
import { MIDI_ACTIONS } from '../src/midicontrol';

describe('filter presets', () => {
  it('start with the wanderers in charge and a two-beat glide', () => {
    expect(defaultState.filterPreset).toBe(0);
    expect(defaultState.filterMove).toBe(true);
    expect(defaultState.filterHold).toBe(false);
    expect(defaultState.filterFocus).toBe(0);
    expect(defaultState.filterGlide).toBe(2);
    expect(FILTER_PRESETS[0].mode).toBe(0);
  });

  it('cycle presets and the module they go to, and wrap', () => {
    expect(nextFilterPreset(0)).toBe(1);
    expect(nextFilterPreset(FILTER_PRESETS.length - 1)).toBe(0);
    expect(nextFilterFocus(0)).toBe(1);
    expect(nextFilterFocus(FILTER_FOCUS_NAMES.length - 1)).toBe(0);
    expect(focusIncludes(0, 3)).toBe(true);
    expect(focusIncludes(2, 1)).toBe(true);
    expect(focusIncludes(2, 0)).toBe(false);
  });

  it('tell the engine the preset for the whole mix, or for one module, with the glide in seconds', () => {
    const top = { ...defaultState, filterPreset: 8, bpm: 120 }; // Top, 2 beats at 120 BPM = 1 s
    const all = JSON.parse(filterTargetsJson(top));
    expect(all.glide).toBeCloseTo(1);
    expect(all.parts.map((p: { mode: number }) => p.mode)).toEqual([2, 2, 2, 2]);
    const padOnly = JSON.parse(filterTargetsJson({ ...top, filterFocus: 2 }));
    expect(padOnly.parts.map((p: { mode: number }) => p.mode)).toEqual([0, 2, 0, 0]);
    const none = JSON.parse(filterTargetsJson({ ...top, filterPreset: 0 }));
    expect(none.parts.every((p: { mode: number }) => p.mode === 0)).toBe(true);
  });

  it('stop the wanderers on the channels a preset owns, and nothing else', () => {
    const s = { ...defaultState, filterPreset: 3, filterFocus: 2 }; // chord pad only
    expect(presetOwnsChannel(s, s.pad.channel)).toBe(true);
    expect(presetOwnsChannel(s, 9)).toBe(false);
    expect(presetOwnsChannel({ ...s, filterPreset: 0 }, s.pad.channel)).toBe(false);
    const ws = JSON.parse(toEngineJson({ ...s, wanderers: s.wanderers.map((w) => ({ ...w, enabled: true, channel: s.pad.channel })) })).wanderers;
    expect(ws.every((w: { enabled: boolean }) => w.enabled === false)).toBe(true);
  });

  it('the filter movement switch silences every wanderer, and the hold goes to the engine', () => {
    const on = { ...defaultState, wanderers: defaultState.wanderers.map((w) => ({ ...w, enabled: true })) };
    expect(JSON.parse(toEngineJson(on)).wanderers.every((w: { enabled: boolean }) => w.enabled)).toBe(true);
    const off = JSON.parse(toEngineJson({ ...on, filterMove: false }));
    expect(off.wanderers.every((w: { enabled: boolean }) => !w.enabled)).toBe(true);
    expect(JSON.parse(toEngineJson({ ...on, filterHold: true })).filterHold).toBe(true);
  });

  it('are saved per scene (the preset and the movement switch); the module and glide are global', () => {
    const s = switchScene(switchScene({ ...defaultState, filterPreset: 3, filterMove: false, filterFocus: 4, filterGlide: 6 }, 1), 0);
    expect(s.filterPreset).toBe(3);
    expect(s.filterMove).toBe(false);
    const other = switchScene({ ...defaultState, filterPreset: 3, filterFocus: 4, filterGlide: 6 }, 1);
    expect(other.filterPreset).toBe(0);
    expect(other.filterFocus).toBe(4);
    expect(other.filterGlide).toBe(6);
    expect(migrateState({ filterHold: true }).filterHold).toBe(false);
  });

  it('map a frequency onto the built-in low-pass control and have keys and a MIDI action', () => {
    expect(hzToCc(60)).toBe(0);
    expect(hzToCc(3600)).toBe(127);
    expect(hzToCc(18000)).toBe(127);
    expect(hzToCc(300)).toBeGreaterThan(30);
    expect(actionForKey('w')).toEqual({ type: 'filterHold' });
    expect(actionForKey('v')).toEqual({ type: 'filterPreset' });
    expect(actionForKey('g')).toEqual({ type: 'filterFocus' });
    for (const id of ['filterHold', 'filterPreset', 'filterFocus']) expect(MIDI_ACTIONS.some((a) => a.id === id)).toBe(true);
  });
});
