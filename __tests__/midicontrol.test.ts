import {
  MIDI_ACTIONS,
  actionForMidi,
  assignTrigger,
  clearTrigger,
  describeMidi,
  describeTrigger,
  isPress,
  parseMidiMap,
  triggerKey,
} from '../src/midicontrol';
import { defaultState, migrateState, toEngineJson } from '../src/config';

const cc = (channel: number, number: number, value = 127) => ({ kind: 'cc' as const, channel, number, value });
const note = (channel: number, number: number, value = 100) => ({ kind: 'note' as const, channel, number, value });
const pc = (channel: number, number: number) => ({ kind: 'pc' as const, channel, number, value: 127 });

describe('MIDI controller mapping', () => {
  it('learns a message for an action and runs it when it arrives', () => {
    const map = assignTrigger('{}', 'freeze', cc(0, 20));
    expect(parseMidiMap(map)).toEqual({ freeze: 'cc:0:20' });
    expect(actionForMidi(map, cc(0, 20))).toEqual({ type: 'freeze' });
    expect(actionForMidi(map, cc(0, 21))).toBeNull();
  });

  it('a note, a program change and a control change are different triggers', () => {
    let map = assignTrigger('{}', 'scene1', note(0, 60));
    map = assignTrigger(map, 'scene2', pc(0, 60));
    map = assignTrigger(map, 'scene3', cc(0, 60));
    expect(actionForMidi(map, note(0, 60))).toEqual({ type: 'scene', index: 0 });
    expect(actionForMidi(map, pc(0, 60))).toEqual({ type: 'scene', index: 1 });
    expect(actionForMidi(map, cc(0, 60))).toEqual({ type: 'scene', index: 2 });
  });

  it('reusing a message takes it off the earlier action', () => {
    let map = assignTrigger('{}', 'freeze', cc(0, 20));
    map = assignTrigger(map, 'panic', cc(0, 20));
    expect(parseMidiMap(map)).toEqual({ panic: 'cc:0:20' });
  });

  it('ignores releases (a control change of zero) but treats a program change as a press', () => {
    const map = assignTrigger('{}', 'freeze', cc(0, 20));
    expect(isPress(cc(0, 20, 0))).toBe(false);
    expect(actionForMidi(map, cc(0, 20, 0))).toBeNull();
    expect(isPress(pc(0, 1))).toBe(true);
  });

  it('can listen to one channel only', () => {
    const map = assignTrigger('{}', 'playStop', note(2, 36));
    expect(actionForMidi(map, note(2, 36), -1)).toEqual({ type: 'playStop' });
    expect(actionForMidi(map, note(2, 36), 2)).toEqual({ type: 'playStop' });
    expect(actionForMidi(map, note(2, 36), 5)).toBeNull();
  });

  it('clears a mapping and survives bad saved data', () => {
    const map = clearTrigger(assignTrigger('{}', 'freeze', cc(0, 20)), 'freeze');
    expect(parseMidiMap(map)).toEqual({});
    expect(parseMidiMap('not json')).toEqual({});
    expect(parseMidiMap('{"freeze":"bad","panic":"cc:1:2","nope":"cc:1:3"}')).toEqual({ panic: 'cc:1:2' });
  });

  it('describes messages in words, with channels counted from 1', () => {
    expect(describeMidi(cc(0, 20))).toBe('control change 20 on channel 1');
    expect(describeTrigger('pc:9:5')).toBe('program change 5 on channel 10');
    expect(describeTrigger(undefined)).toBe('not set');
    expect(triggerKey(note(3, 40))).toBe('note:3:40');
  });

  it('has the actions the keys have, with unique ids', () => {
    const ids = MIDI_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['scene1', 'scene4', 'freeze', 'panic', 'playStop', 'layer:drums', 'solo:bass', 'clearSolo']));
  });

  it('is saved with the other settings, on by default, any channel', () => {
    expect(defaultState.midiControl).toEqual({ enabled: true, channel: -1, map: '{}', double: '{}', doubleMs: 400, hold: '{}', holdMs: 700, releases: false });
    const s = migrateState({ midiControl: { map: '{"freeze":"cc:0:20"}', channel: 3 } });
    expect(s.midiControl.channel).toBe(3);
    expect(parseMidiMap(s.midiControl.map)).toEqual({ freeze: 'cc:0:20' });
    expect(migrateState({ bpm: 90 }).midiControl.channel).toBe(-1);
  });
});

describe('double presses and when scenes change', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mc = require('../src/midicontrol');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sc = require('../src/sceneChange');

  it('maps a button to a second action and keeps only real, different actions', () => {
    let json = mc.setDouble('{}', 'freeze', 'nextScene');
    expect(mc.parseDoubleMap(json)).toEqual({ freeze: 'nextScene' });
    expect(mc.parseDoubleMap(mc.setDouble(json, 'freeze', null))).toEqual({});
    expect(mc.parseDoubleMap(mc.setDouble('{}', 'freeze', 'freeze'))).toEqual({});
    expect(mc.parseDoubleMap(mc.setDouble('{}', 'nope', 'freeze'))).toEqual({});
    expect(mc.parseDoubleMap('not json')).toEqual({});
  });

  it('knows which actions are on/off toggles (the first press is put back before a double press acts)', () => {
    const act = (id: string) => mc.MIDI_ACTIONS.find((a: { id: string }) => a.id === id).action;
    for (const id of ['freeze', 'filterHold', 'layer:drums', 'solo:pad']) expect(mc.isToggleAction(act(id))).toBe(true);
    for (const id of ['nextScene', 'fill', 'filterPreset', 'playStop']) expect(mc.isToggleAction(act(id))).toBe(false);
  });

  it('finds the action id a pedal message is mapped to', () => {
    const map = JSON.stringify({ freeze: 'cc:15:21' });
    expect(mc.idForMidi(map, { kind: 'cc', channel: 15, number: 21, value: 127 }, 15)).toBe('freeze');
    expect(mc.idForMidi(map, { kind: 'cc', channel: 15, number: 21, value: 0 }, 15)).toBeNull();
    expect(mc.idForMidi(map, { kind: 'cc', channel: 3, number: 21, value: 127 }, 15)).toBeNull();
  });

  it('scene change timing: rotates through next bar, end of the progression, end of the scene', () => {
    expect([0, 1, 2].map(sc.nextSceneChangeAt)).toEqual([1, 2, 0]);
    expect(sc.sceneChangeWhen(0)).toBe('starts at the next bar');
    expect(sc.sceneChangeWhen(1)).toBe('starts at the end of the progression');
    expect(defaultState.sceneChangeAt).toBe(0);
    expect(JSON.parse(toEngineJson({ ...defaultState, sceneChangeAt: 2 })).sceneChangeAt).toBe(2);
  });
});

describe('holding a button (a pedal in Momentary mode)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mc = require('../src/midicontrol');

  it('shares the double-press map shape and keeps only real, different actions', () => {
    const json = mc.setHold('{}', 'fill', 'filterPreset');
    expect(mc.parseHoldMap(json)).toEqual({ fill: 'filterPreset' });
    expect(mc.parseHoldMap(mc.setHold(json, 'fill', null))).toEqual({});
    expect(mc.parseHoldMap(mc.setHold('{}', 'fill', 'fill'))).toEqual({});
  });

  it('only watches for a hold on a button that has been seen to send a release', () => {
    expect(mc.holdArmed(true, false)).toBe(false); // Single mode: no release ever arrives, so a tap must not look like a hold
    expect(mc.holdArmed(true, true)).toBe(true);
    expect(mc.holdArmed(false, true)).toBe(false);
  });

  it('recognises a second press of the same button inside the window and nothing else', () => {
    const last = { id: 'freeze', at: 1000 };
    expect(mc.isDoublePress(last, 'freeze', 1300, 400)).toBe(true);
    expect(mc.isDoublePress(last, 'freeze', 1500, 400)).toBe(false);
    expect(mc.isDoublePress(last, 'fill', 1100, 400)).toBe(false);
    expect(mc.isDoublePress(null, 'freeze', 1100, 400)).toBe(false);
  });

  it('is saved with the other settings', () => {
    const s = migrateState({ midiControl: { hold: '{"fill":"freeze"}', holdMs: 900 } });
    expect(s.midiControl.holdMs).toBe(900);
    expect(mc.parseHoldMap(s.midiControl.hold)).toEqual({ fill: 'freeze' });
    expect(migrateState({}).midiControl.holdMs).toBe(700);
  });
});
