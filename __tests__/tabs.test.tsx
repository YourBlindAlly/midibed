import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

import { TABS, TabBar, neighborTab, tabAnnouncement, tabIndex } from '../src/tabs';

async function render(element: React.ReactElement) {
  let tree: any;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

describe('tab navigation', () => {
  it('has the four tabs in order, Live first', () => {
    expect(TABS.map((t) => t.id)).toEqual(['live', 'parts', 'scene', 'setup']);
  });

  it('moves to the next or previous tab and stops at the ends', () => {
    expect(neighborTab('live', 'next')).toBe('parts');
    expect(neighborTab('parts', 'next')).toBe('scene');
    expect(neighborTab('parts', 'previous')).toBe('live');
    expect(neighborTab('live', 'previous')).toBe('live');
    expect(neighborTab('setup', 'next')).toBe('setup');
    expect(tabIndex('scene')).toBe(2);
    expect(tabIndex('parts')).toBe(1);
  });

  it('announces the tab and its place', () => {
    expect(tabAnnouncement('parts')).toBe('Parts, tab 2 of 4');
    expect(tabAnnouncement('scene')).toBe('Scene, tab 3 of 4');
    expect(tabAnnouncement('setup')).toBe('Setup, tab 4 of 4');
  });
});

describe('tab bar', () => {
  const tabsOf = (tree: any) => tree.root.findAll((n: any) => n.props && n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');

  it('shows four tabs as a tab list, with the selected one marked', async () => {
    const tree = await render(<TabBar selected="scene" onSelect={() => {}} />);
    expect(tree.root.findAll((n: any) => n.props && n.props.accessibilityRole === 'tablist').length).toBeGreaterThan(0);
    const tabs = tabsOf(tree);
    expect(tabs.map((t: any) => t.props.accessibilityLabel)).toEqual(['Live', 'Parts', 'Scene', 'Setup']);
    expect(tabs.map((t: any) => t.props.accessibilityState.selected)).toEqual([false, false, true, false]);
  });

  it('selects the tab that is pressed', async () => {
    const picked: string[] = [];
    const tree = await render(<TabBar selected="live" onSelect={(id) => picked.push(id)} />);
    await act(async () => tabsOf(tree)[1].props.onPress());
    expect(picked).toEqual(['parts']);
  });
});
