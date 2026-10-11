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
    expect(labels(tree)).toEqual(expect.arrayContaining(['Bass drone layer', 'Percussion layer', 'Solo drums', 'Tempo', 'Swing', 'Freeze', 'All notes off', 'What happens next']));
    expect(labels(tree)).not.toContain('Progression preset');
    expect(labels(tree)).not.toContain('Bass: stay normal for');

    // Parts: the first part is the bass drone, with the same headings every part has
    await tabPress('Parts');
    expect(labels(tree)).toEqual(
      expect.arrayContaining(['Part', 'Bass drone on', 'Solo Bass drone', 'Bass drone MIDI channel', 'Bass drone level', 'Bass drone fade in', 'Bass follows chords', 'Bass drone program', 'Cutoff wander']),
    );
    expect(labels(tree)).not.toContain('Tempo');
    expect(labels(tree)).not.toContain('Pad follows chords');
    expect(labels(tree)).not.toContain('Bass: stay normal for');
    expect(labels(tree)).not.toContain('Kick hits');

    // Choose another part with the Part stepper: its own controls replace the bass ones
    const partStepper = tree.root.findAll((n: any) => n.props && n.props.accessibilityLabel === 'Part' && n.props.accessibilityActions)[0];
    expect(partStepper).toBeDefined();
    await act(async () => partStepper.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(labels(tree)).toEqual(expect.arrayContaining(['Pad follows chords', 'Pad MIDI channel', 'Chord pad level']));
    expect(labels(tree)).not.toContain('Bass follows chords');

    // Scene: the chords and key, breathing, what happens after, and the transitions
    await tabPress('Scene');
    expect(labels(tree)).toEqual(
      expect.arrayContaining([
        'Key (root note)',
        'Progression preset',
        'Mode',
        'After this scene',
        'Breathing preset',
        'Right now',
        'Bass: stay normal for',
        'Pad: stay normal for',
        'Drums: play for',
        'Scene start sound in this scene',
        'Recurring sound in this scene',
        'Shortest lead-in',
        'Recurring sound',
      ]),
    );
    expect(labels(tree)).not.toContain('Kick hits');

    // Setup
    await tabPress('Setup');
    expect(labels(tree)).toEqual(
      expect.arrayContaining(['Send MIDI', 'Built-in test sound', 'Announce breathing changes', 'Keyboard shortcuts', 'Last key received', 'Send levels to the apps', 'Fade volume control number', 'New app name']),
    );

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
