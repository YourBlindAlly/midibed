import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

import { ActionButton, HelpContext, Note, Stepper, Toggle } from '../src/controls';
import { defaultState, migrateState } from '../src/config';
import { PAD_PRESETS, applyPadPreset, defaultPadVoice, padVoiceJson, padVoiceValues, setPadVoice } from '../src/padvoice';

async function render(element: React.ReactElement) {
  let tree: any;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

const byLabel = (tree: any, label: string) => tree.root.findAll((n: any) => n.props && n.props.accessibilityLabel === label)[0];

describe('hiding the explanations', () => {
  it('a Note is drawn when explanations are on and not at all when they are off', async () => {
    const on = await render(
      <HelpContext.Provider value={{ notes: true, hints: true }}>
        <Note>Some help text</Note>
      </HelpContext.Provider>,
    );
    expect(JSON.stringify(on.toJSON())).toContain('Some help text');
    const off = await render(
      <HelpContext.Provider value={{ notes: false, hints: true }}>
        <Note>Some help text</Note>
      </HelpContext.Provider>,
    );
    expect(off.toJSON()).toBeNull();
  });

  it('the spoken hints go too when hints are off, and stay when they are on', async () => {
    const make = (hints: boolean) => (
      <HelpContext.Provider value={{ notes: true, hints }}>
        <Stepper label="A" value={1} onChange={() => {}} min={0} max={3} hint="step hint" />
        <Toggle label="B" value={false} onChange={() => {}} hint="toggle hint" />
        <ActionButton label="C" onPress={() => {}} hint="button hint" />
      </HelpContext.Provider>
    );
    const on = await render(make(true));
    expect(byLabel(on, 'A').props.accessibilityHint).toBe('step hint');
    expect(byLabel(on, 'B').props.accessibilityHint).toContain('toggle hint');
    expect(byLabel(on, 'C').props.accessibilityHint).toBe('button hint');
    const off = await render(make(false));
    expect(byLabel(off, 'A').props.accessibilityHint).toBeUndefined();
    expect(byLabel(off, 'B').props.accessibilityHint).toBeUndefined();
    expect(byLabel(off, 'C').props.accessibilityHint).toBeUndefined();
    // the control itself is unchanged
    expect(byLabel(off, 'A').props.accessibilityRole).toBe('adjustable');
  });

  it('with no provider the help is shown (nothing is hidden by default)', async () => {
    const tree = await render(<Note>Plain</Note>);
    expect(JSON.stringify(tree.toJSON())).toContain('Plain');
  });

  it('is a saved global setting, on by default', () => {
    expect(defaultState.showNotes).toBe(true);
    expect(defaultState.readHints).toBe(true);
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.showNotes;
    delete old.readHints;
    const m = migrateState(old);
    expect([m.showNotes, m.readHints]).toEqual([true, true]);
    expect(migrateState({ ...old, showNotes: false }).showNotes).toBe(false);
  });

  it('the screen has the two switches and the live readouts are not hidden', () => {
    const app = require('fs').readFileSync('App.tsx', 'utf8');
    expect(app).toContain('label="Show explanations"');
    expect(app).toContain('label="Read hints"');
    expect(app).toContain('<HelpContext.Provider value={{ notes: state.showNotes, hints: state.readHints }}>');
    // status lines stay as plain Text
    expect(app).toContain('<Text style={styles.note}>{advanceSentence}</Text>');
    expect(app).toContain('<Text style={styles.note}>{harmonySummary}</Text>');
    // and the long help sentences are Notes
    expect(app).toContain('<Note>');
  });
});

describe('the chord pad sound shape', () => {
  it('starts as the classic pad, and every preset keeps to subtle ranges', () => {
    expect(defaultPadVoice.preset).toBe(1);
    expect(defaultPadVoice.wave).toBe(0);
    expect(defaultPadVoice.flange).toBe(0);
    for (const p of PAD_PRESETS) {
      expect(p.v.flange).toBeLessThanOrEqual(50);
      expect(p.v.flangeFeedback).toBeLessThanOrEqual(60);
      expect(p.v.detune).toBeLessThanOrEqual(25);
    }
  });

  it('editing makes it Custom, and a preset sets everything', () => {
    const glass = applyPadPreset(defaultPadVoice, PAD_PRESETS.findIndex((p) => p.name === 'Glass'));
    expect(glass.wave).toBe(85);
    const edited = setPadVoice(glass, { drift: 70 });
    expect(edited.preset).toBe(0);
    expect(edited.wave).toBe(85);
  });

  it('sends seven numbers in the order the synth reads them, in range', () => {
    const v = padVoiceValues({ ...defaultPadVoice, wave: 200, detune: 99, drift: 50, flange: 35, flangeRate: 15, flangeDepth: 40, flangeFeedback: 90 });
    expect(v).toEqual([1, 40, 0.5, 0.35, 1.5, 0.4, 0.75]);
    expect(JSON.parse(padVoiceJson(defaultPadVoice)).values).toEqual([0, 8.7, 0, 0, 1.5, 0.4, 0.3]);
  });

  it('is global, saved, and the Swift synth starts with the same numbers and plays it', () => {
    const fs = require('fs');
    const swift = fs.readFileSync('modules/midibed-engine/ios/MidiBedTestSynth.swift', 'utf8');
    expect(swift).toContain('padParams.initialize(from: [0, 8.7, 0, 0, 1.5, 0.4, 0.3, 0], count: 8)');
    expect(swift).toContain('func configurePad(');
    expect(swift).toContain('private func padOsc(');
    expect(swift).toContain('A slow flange on the chord pad');
    const engine = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(engine).toContain('func setPadVoice(');
    const mod = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngineModule.swift', 'utf8');
    expect(mod).toContain('Function("setPadVoice")');
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.padVoice;
    expect(migrateState(old).padVoice).toEqual(defaultPadVoice);
  });
});
