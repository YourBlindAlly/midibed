import { STOP_STYLE_NAMES, defaultEnding, endingJson, endingSentence, nextStopStyle, barsLeftText } from '../src/ending';
import { defaultState, migrateState, switchScene, toEngineJson } from '../src/config';
import { actionForKey } from '../src/shortcuts';
import { MIDI_ACTIONS } from '../src/midicontrol';

describe('orchestrated stop', () => {
  it('starts as the old stop-at-once, with a cut, a final kick and a Boom ready', () => {
    expect(defaultEnding).toEqual({ style: 0, fade: 0, finalHit: true, noise: true, noiseShape: 3, noiseLevel: 60, holdBeats: 0 });
    expect(STOP_STYLE_NAMES).toHaveLength(4);
  });

  it('rotates through the four styles and wraps', () => {
    expect([0, 1, 2, 3].map(nextStopStyle)).toEqual([1, 2, 3, 0]);
  });

  it('sends the engine a bar-line style 1-3 and units it expects', () => {
    const j = JSON.parse(endingJson({ ...defaultEnding, style: 2, fade: 1, noiseLevel: 50 }));
    expect(j).toEqual({ style: 2, fadeBars: 1, finalHit: true, noise: true, noiseShape: 3, noiseLevel: 0.5, holdBeats: 0 });
    expect(JSON.parse(endingJson({ ...defaultEnding, style: 0 })).style).toBe(1); // never "now": that is a plain stop
  });

  it('has words for each style and for the bars left', () => {
    expect(endingSentence(2)).toBe('Ending at the end of the progression');
    expect(endingSentence(0)).toBe('Stopped');
    expect(barsLeftText(1)).toBe('Ending on the next bar line');
    expect(barsLeftText(3)).toBe('Ending in 3 bars');
  });

  it('is a global setting, saved, and the engine config does not carry it', () => {
    const s = { ...defaultState, ending: { ...defaultEnding, style: 3 } };
    expect(switchScene(s, 1).ending.style).toBe(3);
    expect(migrateState({}).ending).toEqual(defaultEnding);
    expect(migrateState({ ending: { style: 2 } }).ending.finalHit).toBe(true);
    expect(JSON.parse(toEngineJson(s))).not.toHaveProperty('ending');
  });

  it('has a key (T) and a MIDI action to rotate the style', () => {
    expect(actionForKey('t')).toEqual({ type: 'stopStyle' });
    expect(MIDI_ACTIONS.some((a) => a.id === 'stopStyle')).toBe(true);
  });
});
