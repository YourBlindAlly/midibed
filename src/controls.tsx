import React, { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionUi, defaultSectionUi, isCollapsed } from './sectionui';

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

/**
 * Whether the explanations are shown: the sentences of help text (Note) and the spoken hints that VoiceOver
 * reads after a control. Both can be switched off, so moving through the screen is quicker.
 */
export const HelpContext = createContext<{ notes: boolean; hints: boolean }>({ notes: true, hints: true });

/** A sentence of explanation. Not drawn at all when explanations are switched off. */
export function Note({ children }: { children?: React.ReactNode }) {
  const { notes } = useContext(HelpContext);
  if (!notes) return null;
  return <Text style={styles.note}>{children}</Text>;
}

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
  const { hints } = useContext(HelpContext);
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
      accessibilityHint={hints ? hint ?? 'Swipe up or down to adjust' : undefined}
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
  const { hints } = useContext(HelpContext);
  const flickHint = 'Swipe up for on, swipe down for off, or double tap to switch.';
  return (
    <Pressable
      hitSlop={SLOP}
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value ? 'On' : 'Off' }}
      accessibilityHint={hints ? (hint ? `${hint}. ${flickHint}` : flickHint) : undefined}
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
  const { hints } = useContext(HelpContext);
  return (
    <Pressable
      hitSlop={SLOP}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hints ? hint : undefined}
      onPress={onPress}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/** The screen's open/closed sections and the way to flip one (provided by App.tsx). */
export const SectionUiContext = createContext<{ ui: SectionUi; toggle: (id: string) => void }>({
  ui: defaultSectionUi,
  toggle: () => {},
});

/**
 * A group of controls under a heading. The heading is a button too: double tap to close or open the group.
 * A closed group is not drawn at all, so VoiceOver goes from one heading to the next. `fixed` groups
 * cannot be closed (the module chooser). `inner` is a smaller group inside a card (no card of its own).
 * The id is the title unless one is given.
 */
export function Section({
  title,
  children,
  id,
  fixed,
  inner,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  fixed?: boolean;
  inner?: boolean;
}) {
  const { ui, toggle } = useContext(SectionUiContext);
  const key = id ?? title;
  const closed = !fixed && isCollapsed(ui, key);
  const head = fixed ? (
    <Text style={inner ? styles.innerTitle : styles.sectionTitle} accessibilityRole="header">
      {title}
    </Text>
  ) : (
    <Pressable
      hitSlop={SLOP}
      accessibilityRole="header"
      // The state is IN the label so it is always spoken (the expanded state alone was not read on the device).
      accessibilityLabel={`${title}, ${closed ? 'collapsed' : 'expanded'}`}
      accessibilityHint={closed ? 'Double tap to open' : 'Double tap to close'}
      onPress={() => toggle(key)}
      style={styles.sectionHead}
    >
      <Text style={inner ? styles.innerTitle : styles.sectionTitle}>{`${closed ? '▸' : '▾'} ${title}${closed ? ' (closed)' : ''}`}</Text>
    </Pressable>
  );
  return (
    <View style={inner ? styles.inner : styles.card}>
      {head}
      {closed ? null : children}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.dim, fontSize: 15, marginTop: 6, marginBottom: 6 },
  sectionHead: { minHeight: 44, justifyContent: 'center' },
  inner: { marginTop: 6, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.line },
  innerTitle: { color: colors.accent, fontSize: 16, fontWeight: '600', paddingVertical: 4 },
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
