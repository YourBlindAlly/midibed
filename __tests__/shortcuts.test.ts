import { actionForKey, SHORTCUT_HELP } from '../src/shortcuts';
import { defaultMixer, levelText, mixerMessages } from '../src/mixer';
import { defaultState, migrateState, toEngineJson } from '../src/config';

describe('keyboard shortcuts', () => {
  it('maps number keys to scenes', () => {
    expect(actionForKey('1')).toEqual({ type: 'scene', index: 0 });
    expect(actionForKey('4')).toEqual({ type: 'scene', index: 3 });
  });
  it('maps the named actions, in either case', () => {
    expect(actionForKey('f')).toEqual({ type: 'freeze' });
    expect(actionForKey('P')).toEqual({ type: 'panic' });
    expect(actionForKey('s')).toEqual({ type: 'playStop' });
    expect(actionForKey('n')).toEqual({ type: 'nextScene' });
    expect(actionForKey('b')).toEqual({ type: 'prevScene' });
    expect(actionForKey('j')).toEqual({ type: 'nextJourney' });
    expect(actionForKey('k')).toEqual({ type: 'prevJourney' });
  });
  it('maps the layer keys', () => {
    expect(actionForKey('d')).toEqual({ type: 'layer', layer: 'drums' });
    expect(actionForKey('c')).toEqual({ type: 'layer', layer: 'pad' });
    expect(actionForKey('r')).toEqual({ type: 'layer', layer: 'bass' });
    expect(actionForKey('m')).toEqual({ type: 'layer', layer: 'dancer' });
    expect(actionForKey('l')).toEqual({ type: 'layer', layer: 'loops' });
  });
  it('ignores everything else', () => {
    expect(actionForKey('')).toBeNull();
    expect(actionForKey('0')).toBeNull();
    expect(actionForKey('z')).toBeNull();
    expect(actionForKey('ab')).toBeNull();
  });
  it('lists them for the Setup screen', () => {
    expect(SHORTCUT_HELP.length).toBeGreaterThan(4);
  });
  it('are on by default and saved with old settings getting the default', () => {
    expect(defaultState.shortcuts).toBe(true);
    expect(migrateState({ bpm: 90 }).shortcuts).toBe(true);
  });
});

describe('mixer', () => {
  const routing = {
    mixer: { ...defaultMixer, send: true, bass: 80, pad: 60, dancer: 50, drums: 90, loops: 70 },
    drone: { channel: 0 },
    pad: { channel: 1 },
    dancer: { channel: 3 },
    drums: [{ channel: 9 }, { channel: 9 }, { channel: 9 }, { channel: 9 }],
    loops: { channel: 9 },
  };

  it('sends nothing until switched on', () => {
    expect(mixerMessages({ ...routing, mixer: { ...routing.mixer, send: false } })).toEqual([]);
    expect(defaultState.mixer.send).toBe(false);
  });

  it('sends one volume control per part channel', () => {
    const m = mixerMessages(routing);
    expect(m.filter((x) => !x.loops).map((x) => [x.part, x.channel, x.cc, x.value])).toEqual([
      ['bass', 0, 7, 80],
      ['pad', 1, 7, 60],
      ['dancer', 3, 7, 50],
      ['drums', 9, 7, 90], // four drums on one channel: one message
    ]);
  });

  it('uses the loops app own loop volume control, on the loops port', () => {
    const m = mixerMessages(routing, 85).find((x) => x.part === 'loops');
    expect(m).toMatchObject({ channel: 9, cc: 85, value: 70, loops: true });
  });

  it('the first part wins when two share a channel', () => {
    const m = mixerMessages({ ...routing, pad: { channel: 0 } });
    expect(m.filter((x) => x.channel === 0)).toHaveLength(1);
    expect(m.find((x) => x.channel === 0)?.part).toBe('bass');
  });

  it('says levels as percent, and is not part of the engine settings', () => {
    expect(levelText(127)).toBe('100 percent');
    expect(levelText(64)).toBe('50 percent');
    expect(JSON.parse(toEngineJson(defaultState)).mixer).toBeUndefined();
  });
});
