import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

import { Toggle, toggleAdjust } from '../src/controls';

// React 19's test renderer must be driven inside an async act().
async function render(element: React.ReactElement) {
  let tree: any;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

// The outermost element carrying the accessibility label is the Pressable.
const find = (tree: any) => tree.root.findAll((n: any) => n.props && n.props.accessibilityLabel === 'Drone')[0];

describe('toggle flick gesture', () => {
  it('swipe up means on and swipe down means off, never the opposite', () => {
    expect(toggleAdjust(false, 'increment')).toBe(true);
    expect(toggleAdjust(true, 'increment')).toBe(true);
    expect(toggleAdjust(true, 'decrement')).toBe(false);
    expect(toggleAdjust(false, 'decrement')).toBe(false);
    expect(toggleAdjust(true, 'somethingElse')).toBe(true);
  });

  it('is an adjustable element that reports On or Off as its value', async () => {
    const tree = await render(<Toggle label="Drone" value={false} onChange={() => {}} />);
    const el = find(tree);
    expect(el.props.accessibilityRole).toBe('adjustable');
    expect(el.props.accessibilityValue).toEqual({ text: 'Off' });
    expect(el.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['increment', 'decrement']);
    await act(async () => {
      tree.update(<Toggle label="Drone" value onChange={() => {}} />);
    });
    expect(find(tree).props.accessibilityValue).toEqual({ text: 'On' });
  });

  it('calls onChange only when the flick actually changes the state', async () => {
    const calls: boolean[] = [];
    const tree = await render(<Toggle label="Drone" value={false} onChange={(v) => calls.push(v)} />);
    const el = find(tree);
    await act(async () => el.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } })); // already off
    expect(calls).toEqual([]);
    await act(async () => el.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(calls).toEqual([true]);
  });

  it('still flips on a plain press (double tap or touch)', async () => {
    const calls: boolean[] = [];
    const tree = await render(<Toggle label="Drone" value onChange={(v) => calls.push(v)} />);
    await act(async () => find(tree).props.onPress());
    expect(calls).toEqual([false]);
  });

  it('explains the gesture in the hint', async () => {
    const tree = await render(<Toggle label="Drone" value={false} onChange={() => {}} hint="Starts the drone" />);
    const hint: string = find(tree).props.accessibilityHint;
    expect(hint).toContain('Starts the drone');
    expect(hint).toContain('Swipe up for on');
  });
});
