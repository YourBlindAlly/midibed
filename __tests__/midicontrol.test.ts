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
import { defaultState, migrateState } from '../src/config';

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
    expect(defaultState.midiControl).toEqual({ enabled: true, channel: -1, map: '{}' });
    const s = migrateState({ midiControl: { map: '{"freeze":"cc:0:20"}', channel: 3 } });
    expect(s.midiControl.channel).toBe(3);
    expect(parseMidiMap(s.midiControl.map)).toEqual({ freeze: 'cc:0:20' });
    expect(migrateState({ bpm: 90 }).midiControl.channel).toBe(-1);
  });
});
