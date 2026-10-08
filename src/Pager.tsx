import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Wraps the screen so VoiceOver's three-finger left/right swipe (and the matching
 * braille-keyboard command) can move between tabs, and so the two-finger double
 * tap ("magic tap") reaches the app. See ios/MidiBedPagerView.swift.
 * Falls back to a plain View where there is no native engine (Jest, a browser).
 */
let NativePager: React.ComponentType<{
  style?: StyleProp<ViewStyle>;
  onPage?: (e: { nativeEvent: { direction: 'next' | 'previous' } }) => void;
  onMagicTap?: () => void;
  children?: React.ReactNode;
}> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireNativeViewManager } = require('expo-modules-core');
  NativePager = requireNativeViewManager('MidiBedEngine');
} catch {
  NativePager = null;
}

export function Pager({
  onPage,
  onMagicTap,
  style,
  children,
}: {
  onPage: (direction: 'next' | 'previous') => void;
  onMagicTap?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  if (!NativePager) return <View style={style}>{children}</View>;
  return (
    <NativePager style={style} onPage={(e) => onPage(e.nativeEvent.direction)} onMagicTap={() => onMagicTap?.()}>
      {children}
    </NativePager>
  );
}
