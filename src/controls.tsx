import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const colors = {
  bg: '#000000',
  card: '#14161a',
  line: '#2a2d33',
  text: '#f2f2f2',
  dim: '#9aa0a8',
  accent: '#7fb7ff',
  on: '#2f7d4f',
};

const SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

type StepperProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Optional bigger jump, exposed as extra VoiceOver custom actions. */
  bigStep?: number;
  /** Text spoken/shown for the value, e.g. "D2" instead of "38". */
  format?: (v: number) => string;
  hint?: string;
};

/**
 * A value you change with VoiceOver's swipe up/down (adjustable role) or with
 * the visible -/+ buttons. The adjustable props sit on the wrapping View, not on
 * a Text, because on-device a Text with these props did not fire the actions.
 * The visible buttons are hidden from VoiceOver so each control is ONE stop.
 */
export function Stepper({ label, value, onChange, min, max, step = 1, bigStep, format, hint }: StepperProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const text = format ? format(value) : String(value);

  const actions = [
    { name: 'increment' as const, label: 'increase' },
    { name: 'decrement' as const, label: 'decrease' },
    ...(bigStep
      ? [
          { name: 'bigUp', label: `increase by ${bigStep}` },
          { name: 'bigDown', label: `decrease by ${bigStep}` },
        ]
      : []),
  ];

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text }}
      accessibilityHint={hint ?? 'Swipe up or down to adjust'}
      accessibilityActions={actions}
      onAccessibilityAction={(e) => {
        switch (e.nativeEvent.actionName) {
          case 'increment':
            onChange(clamp(value + step));
            break;
          case 'decrement':
            onChange(clamp(value - step));
            break;
          case 'bigUp':
            onChange(clamp(value + (bigStep ?? step)));
            break;
          case 'bigDown':
            onChange(clamp(value - (bigStep ?? step)));
            break;
        }
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.buttons} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Pressable hitSlop={SLOP} style={styles.btn} onPress={() => onChange(clamp(value - step))}>
          <Text style={styles.btnText}>-</Text>
        </Pressable>
        <Text style={styles.value}>{text}</Text>
        <Pressable hitSlop={SLOP} style={styles.btn} onPress={() => onChange(clamp(value + step))}>
          <Text style={styles.btnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ToggleProps = {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
};

/**
 * An on/off switch you can flick: with VoiceOver, swipe UP for on and DOWN for
 * off (an "adjustable" element, same gesture as every other value control here).
 * Double-tap still flips it, and so does a plain tap with VoiceOver off. The
 * state is read out as the value ("On"/"Off") so it is announced after each change.
 */
export function toggleAdjust(value: boolean, action: string): boolean {
  if (action === 'increment') return true;
  if (action === 'decrement') return false;
  return value;
}

export function Toggle({ label, value, onChange, hint }: ToggleProps) {
  const flickHint = 'Swipe up for on, swipe down for off, or double tap to switch.';
  return (
    <Pressable
      hitSlop={SLOP}
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value ? 'On' : 'Off' }}
      accessibilityHint={hint ? `${hint}. ${flickHint}` : flickHint}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const next = toggleAdjust(value, e.nativeEvent.actionName);
        if (next !== value) onChange(next);
      }}
      onPress={() => onChange(!value)}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.pill, value && { backgroundColor: colors.on }]}>
        <Text style={styles.pillText}>{value ? 'On' : 'Off'}</Text>
      </View>
    </Pressable>
  );
}

export function ActionButton({ label, onPress, hint }: { label: string; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      hitSlop={SLOP}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 6,
  },
  label: { color: colors.text, fontSize: 17, flexShrink: 1, paddingRight: 12 },
  buttons: { flexDirection: 'row', alignItems: 'center' },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.text, fontSize: 24 },
  value: { color: colors.accent, fontSize: 18, minWidth: 64, textAlign: 'center' },
  pill: {
    minWidth: 64,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.line,
    alignItems: 'center',
  },
  pillText: { color: colors.text, fontSize: 16 },
  action: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    paddingHorizontal: 12,
  },
  actionText: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '600', marginBottom: 6 },
});
