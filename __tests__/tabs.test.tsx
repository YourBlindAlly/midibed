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
  it('has the five tabs in order, Live first', () => {
    expect(TABS.map((t) => t.id)).toEqual(['live', 'harmony', 'rhythm', 'sound', 'setup']);
  });

  it('moves to the next or previous tab and stops at the ends', () => {
    expect(neighborTab('live', 'next')).toBe('harmony');
    expect(neighborTab('harmony', 'previous')).toBe('live');
    expect(neighborTab('live', 'previous')).toBe('live');
    expect(neighborTab('setup', 'next')).toBe('setup');
    expect(tabIndex('sound')).toBe(3);
  });

  it('announces the tab and its place', () => {
    expect(tabAnnouncement('harmony')).toBe('Harmony, tab 2 of 5');
    expect(tabAnnouncement('setup')).toBe('Setup, tab 5 of 5');
  });
});

describe('tab bar', () => {
  const tabsOf = (tree: any) => tree.root.findAll((n: any) => n.props && n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');

  it('shows five tabs as a tab list, with the selected one marked', async () => {
    const tree = await render(<TabBar selected="rhythm" onSelect={() => {}} />);
    expect(tree.root.findAll((n: any) => n.props && n.props.accessibilityRole === 'tablist').length).toBeGreaterThan(0);
    const tabs = tabsOf(tree);
    expect(tabs.map((t: any) => t.props.accessibilityLabel)).toEqual(['Live', 'Harmony', 'Rhythm', 'Sound', 'Setup']);
    expect(tabs.map((t: any) => t.props.accessibilityState.selected)).toEqual([false, false, true, false, false]);
  });

  it('selects the tab that is pressed', async () => {
    const picked: string[] = [];
    const tree = await render(<TabBar selected="live" onSelect={(id) => picked.push(id)} />);
    await act(async () => tabsOf(tree)[3].props.onPress());
    expect(picked).toEqual(['sound']);
  });
});
