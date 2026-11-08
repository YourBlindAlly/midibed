import { defaultState, switchScene, toEngineJson, migrateState } from '../src/config';
import { addUserRhythm, cleanCustom, countOf, describeText, maskOf, patternSteps, patternString, rotatedText, stepName, stepStateAt, withStep } from '../src/stepedit';
import { RHYTHMS } from '../src/rhythms';
import { applyGroove, captureGroove, checkGroove } from '../src/grooves';

const kick = (over: object = {}) => ({ ...defaultState.drums[0], ...over });

describe('editing a pattern one step at a time', () => {
  it('starts from the current pattern and changes one step', () => {
    const k = kick({ rhythm: RHYTHMS.findIndex((r) => r.name === 'Kick on 1 and 3') });
    expect(patternString(k)).toBe('x.......x.......');
    const edited = withStep(k, 15, 1);
    expect(edited).toBe('x.......x......x');
    expect(withStep({ ...k, custom: edited }, 8, 2)).toBe('x.......g......x');
    expect(withStep({ ...k, custom: edited }, 0, 0)).toBe('........x......x');
    expect(patternSteps({ ...k, custom: edited })).toBe(16);
  });

  it('starts from the Euclidean spread when no rhythm is chosen', () => {
    expect(patternString(kick({ rhythm: 0, hits: 4, steps: 16 }))).toBe('x...x...x...x...');
  });

  it('names the steps as they are said, and reads them back', () => {
    expect(stepName(0, 16)).toBe('beat 1');
    expect(stepName(7, 16)).toBe('the a of 2');
    expect(stepName(9, 16)).toBe('the e of 3');
    expect(stepName(6, 16)).toBe('the and of 2');
    expect(stepName(20, 32)).toBe('bar 2, beat 2');
    expect(stepName(2, 5)).toBe('step 3 of 5');
    expect(stepStateAt('x.g', 2)).toBe(2);
    expect(countOf('x.gx', 'x')).toBe(2);
    expect(maskOf('x.gx', 'x')).toBe(9);
    expect(maskOf('x.gx', 'g')).toBe(4);
    expect(maskOf('x'.repeat(32), 'x')).toBe(2 ** 32 - 1);
  });

  it('rotates and describes', () => {
    expect(rotatedText('x...', 1)).toBe('.x..');
    expect(describeText('x.g.', 0)).toBe('hits on steps 1; ghost hits on steps 3 of 4');
  });

  it('only accepts usable text', () => {
    expect(cleanCustom('x..x')).toBe('x..x');
    expect(cleanCustom('x')).toBe('');
    expect(cleanCustom('xyz.')).toBe('');
    expect(cleanCustom('x'.repeat(40))).toBe('');
    expect(cleanCustom(undefined)).toBe('');
  });

  it('reaches the engine as a mask and a ghost mask, and clears itself when not set', () => {
    const drums = defaultState.drums.map((d, i) => (i === 0 ? { ...d, custom: 'x...g..x' } : d));
    const j = JSON.parse(toEngineJson({ ...defaultState, drums }));
    expect(j.drums[0]).toMatchObject({ steps: 8, hits: 2, mask: 1 + 128, useMask: true, ghostMask: 16 });
    const plain = JSON.parse(toEngineJson(defaultState));
    expect(plain.drums[0].ghostMask).toBe(0);
    expect(plain.drums[0].useMask).toBe(false);
  });

  it('is saved with each scene and not leaked into old scenes', () => {
    const drums = defaultState.drums.map((d, i) => (i === 0 ? { ...d, custom: 'x..x' } : d));
    const live = { ...defaultState, drums };
    const away = switchScene(live, 1);
    expect(away.drums[0].custom).toBe('');
    expect(switchScene(away, 0).drums[0].custom).toBe('x..x');
    expect(migrateState({ drums: [{ name: 'Kick' }] }).drums[0].custom).toBe('');
  });

  it('is kept by a saved groove, with its ghost steps', () => {
    const drums = defaultState.drums.map((d, i) => (i === 1 ? { ...d, custom: 'x...g...x...g...', ghostVelocity: 33 } : d));
    const g = captureGroove({ ...defaultState, drums }, 'Stepped');
    expect(g.slots[1]).toMatchObject({ pattern: 'x...g...x...g...', ghost: { velocity: 33 } });
    const back = applyGroove({ ...defaultState, drums: defaultState.drums }, 0);
    expect(back.drums[1].custom).toBe('');
    const checked = checkGroove(JSON.parse(JSON.stringify(g)));
    expect(checked.groove?.slots[1]?.pattern).toBe('x...g...x...g...');
  });

  it('saves the hits as a rhythm with a unique name', () => {
    const r1 = addUserRhythm('[]', 'x..x....', 'Mine');
    expect(r1?.name).toBe('Mine');
    expect(JSON.parse(r1!.list)).toEqual([{ name: 'Mine', steps: 8, hits: [0, 3] }]);
    const r2 = addUserRhythm(r1!.list, 'x...', 'Mine');
    expect(r2?.name).toBe('Mine 2');
    expect(addUserRhythm('[]', '....', 'x')).toBeNull();
    expect(addUserRhythm('not json', 'x...', '')?.name).toBe('My rhythm');
  });
});

describe('open hits and ratchets in the step text', () => {
  it('keeps o, 2, 3 and 4 and counts them as hits', () => {
    expect(cleanCustom('x.o.2.3.4.g...')).toBe('x.o.2.3.4.g...');
    expect(countOf('xo234g.', 'x')).toBe(5);
    expect(maskOf('xo234g.', 'x')).toBe(31);
    expect(maskOf('xo234g.', 'g')).toBe(32);
  });
  it('steps through the states', () => {
    expect(stepStateAt('.xg234o'.slice(1), 0)).toBe(1);
    const base = { rhythm: 0, hits: 0, steps: 4, custom: '....' };
    expect(withStep(base, 1, 6)).toBe('.o..');
    expect(withStep(base, 2, 4)).toBe('..3.');
    expect(stepStateAt('.o', 1)).toBe(6);
    expect(stepStateAt('3', 0)).toBe(4);
  });
  it('is only sent to the engine when it uses them', () => {
    const { defaultState, toEngineJson } = require('../src/config');
    const plain = JSON.parse(toEngineJson({ ...defaultState, drums: defaultState.drums.map((d: any, k: number) => (k === 2 ? { ...d, custom: 'x.x.x.x.x.x.x.x.' } : d)) }));
    expect(plain.drums[2].stepText).toBeUndefined();
    const hat = JSON.parse(toEngineJson({ ...defaultState, drums: defaultState.drums.map((d: any, k: number) => (k === 2 ? { ...d, custom: 'x.x.x.x.x.x.x.o3' } : d)) }));
    expect(hat.drums[2].stepText).toBe('x.x.x.x.x.x.x.o3');
    expect(hat.drums[2].openNote).toBe(46);
    expect(hat.drums[2].mask).toBe(2 ** 16 - 1 - (2 ** 1 + 2 ** 3 + 2 ** 5 + 2 ** 7 + 2 ** 9 + 2 ** 11 + 2 ** 13));
  });
  it('gives a hat its open sound only when it has a different open note', () => {
    const { drumVoicesJson } = require('../src/drumvoice');
    expect(JSON.parse(drumVoicesJson([{ note: 42, channel: 9, voice: 21 }]))[0].openNote).toBe(46);
    expect(JSON.parse(drumVoicesJson([{ note: 46, channel: 9, voice: 21 }]))[0].openNote).toBeUndefined();
    expect(JSON.parse(drumVoicesJson([{ note: 42, channel: 9, voice: 5 }]))[0].openNote).toBeUndefined();
    expect(JSON.parse(drumVoicesJson([{ note: 36, channel: 9, voice: 0 }]))[0].openNote).toBeUndefined();
  });
});
