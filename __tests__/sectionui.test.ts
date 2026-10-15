declare const __dirname: string;
import { collapseAll, defaultSectionUi, expandAll, isCollapsed, parseSectionUi, toggleSection } from '../src/sectionui';
import { defaultState, migrateState } from '../src/config';

describe('section open/closed state', () => {
  it('starts with the rarely needed groups closed and the working ones open', () => {
    expect(isCollapsed(defaultSectionUi, 'Drum fills')).toBe(true);
    expect(isCollapsed(defaultSectionUi, 'Drums: Ugly FX')).toBe(true);
    expect(isCollapsed(defaultSectionUi, 'Kick: More settings')).toBe(true);
    expect(isCollapsed(defaultSectionUi, 'Bass voice: oscillators')).toBe(true);
    expect(isCollapsed(defaultSectionUi, 'Ending')).toBe(false);
    expect(isCollapsed(defaultSectionUi, 'Harmony')).toBe(false);
    expect(isCollapsed(defaultSectionUi, 'Tempo and swing')).toBe(false);
  });

  it('opens and closes one group at a time and remembers it', () => {
    let ui = toggleSection(defaultSectionUi, 'Drum fills');
    expect(isCollapsed(ui, 'Drum fills')).toBe(false);
    expect(isCollapsed(ui, 'Evolving patterns')).toBe(true);
    ui = toggleSection(ui, 'Harmony');
    expect(isCollapsed(ui, 'Harmony')).toBe(true);
    ui = toggleSection(ui, 'Harmony');
    expect(isCollapsed(ui, 'Harmony')).toBe(false);
  });

  it('collapse all and expand all override everything, and later toggles still work', () => {
    expect(isCollapsed(collapseAll, 'Harmony')).toBe(true);
    expect(isCollapsed(expandAll, 'Drum fills')).toBe(false);
    const ui = toggleSection(collapseAll, 'Harmony');
    expect(isCollapsed(ui, 'Harmony')).toBe(false);
    expect(isCollapsed(ui, 'Ending')).toBe(true);
  });

  it('survives being saved: kept in settings as text, bad data falls back to the defaults', () => {
    expect(parseSectionUi('not json')).toEqual(defaultSectionUi);
    expect(parseSectionUi(JSON.stringify({ mode: 'odd', open: { a: true, b: 3 }, closed: [] }))).toEqual({ mode: 'default', open: { a: true }, closed: {} });
    const s = { ...defaultState, sectionUi: JSON.stringify(toggleSection(defaultSectionUi, 'Drum fills')) };
    expect(parseSectionUi(migrateState(JSON.parse(JSON.stringify(s))).sectionUi).open['Drum fills']).toBe(true);
    expect(migrateState({}).sectionUi).toBe(defaultState.sectionUi);
  });
});

describe('what a section heading says', () => {
  it('says collapsed or expanded in its spoken label, and shows a marker for everyone who can see it', () => {
    const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'controls.tsx'), 'utf8');
    expect(src).toContain("${closed ? 'collapsed' : 'expanded'}");
    expect(src).toContain('(closed)');
  });
});

describe('internal and external synth groups', () => {
  it('start with the external group closed (except MidiDancer, which goes to another app) and the internal group open', () => {
    expect(isCollapsed(defaultSectionUi, 'Bass drone: external synth')).toBe(true);
    expect(isCollapsed(defaultSectionUi, 'Chord pad: external synth')).toBe(true);
    expect(isCollapsed(defaultSectionUi, 'Drums: external synth')).toBe(true);
    expect(isCollapsed(defaultSectionUi, 'MidiDancer: external synth')).toBe(false);
    expect(isCollapsed(defaultSectionUi, 'Bass drone: internal synth')).toBe(false);
    expect(isCollapsed(defaultSectionUi, 'Chord pad: where it goes')).toBe(false);
  });
});
