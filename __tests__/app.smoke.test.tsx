import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => (k in store ? store[k] : null),
      setItem: async (k: string, v: string) => {
        store[k] = v;
      },
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: async () => {},
  deactivateKeepAwake: () => {},
}));

import App from '../App';

const labels = (tree: any) =>
  tree.root
    .findAll((n: any) => n.props && typeof n.props.accessibilityLabel === 'string')
    .map((n: any) => n.props.accessibilityLabel as string);

describe('whole screen smoke test', () => {
  it('renders every tab without errors and puts each control on the right tab', async () => {
    let tree: any;
    await act(async () => {
      tree = renderer.create(<App />);
    });

    const tabPress = async (name: string) => {
      const t = tree.root.findAll((n: any) => n.props && n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === name && typeof n.props.onPress === 'function')[0];
      await act(async () => t.props.onPress());
    };

    // The strip is always there: Play and the scene buttons.
    expect(labels(tree)).toEqual(expect.arrayContaining(['Play', 'Scene 1', 'Scene 4']));

    // Live
    expect(labels(tree)).toEqual(expect.arrayContaining(['Drone layer', 'Percussion layer', 'Tempo', 'Swing']));
    expect(labels(tree)).not.toContain('Progression preset');

    await tabPress('Harmony');
    expect(labels(tree)).toEqual(expect.arrayContaining(['Progression preset', 'Mode', 'Drone follows chords', 'Pad follows chords']));
    expect(labels(tree)).not.toContain('Tempo');

    await tabPress('Rhythm');
    expect(labels(tree)).toEqual(expect.arrayContaining(['Kick hits', 'Loops', 'Loop program']));

    await tabPress('Sound');
    expect(labels(tree)).toEqual(expect.arrayContaining(['Cutoff wander', 'Drone fade in', 'Chord pad program']));

    await tabPress('Setup');
    expect(labels(tree)).toEqual(expect.arrayContaining(['Send MIDI', 'Built-in test sound', 'Drums app profile']));

    // The strip is still there on every tab.
    expect(labels(tree)).toEqual(expect.arrayContaining(['Play', 'Scene 2']));
  });

  it('starts and stops with the magic tap handler', async () => {
    let tree: any;
    await act(async () => {
      tree = renderer.create(<App />);
    });
    const holder = tree.root.findAll((n: any) => n.props && typeof n.props.onMagicTap === 'function')[0];
    expect(holder).toBeDefined();
    expect(labels(tree)).toContain('Play');
    await act(async () => holder.props.onMagicTap());
    expect(labels(tree)).toContain('Stop');
    await act(async () => holder.props.onMagicTap());
    expect(labels(tree)).toContain('Play');
  });
});
