import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './controls';

export const TABS = [
  { id: 'live', label: 'Live' },
  { id: 'harmony', label: 'Harmony' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'breathe', label: 'Breathe' },
  { id: 'sound', label: 'Sound' },
  { id: 'setup', label: 'Setup' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function tabIndex(id: TabId): number {
  return TABS.findIndex((t) => t.id === id);
}

/** The next or previous tab, stopping at the ends (no wrap-around). */
export function neighborTab(current: TabId, direction: 'next' | 'previous'): TabId {
  const i = tabIndex(current) + (direction === 'next' ? 1 : -1);
  return TABS[Math.max(0, Math.min(TABS.length - 1, i))].id;
}

/** What VoiceOver should say after changing tab, e.g. "Harmony, tab 2 of 5". */
export function tabAnnouncement(id: TabId): string {
  return `${TABS[tabIndex(id)].label}, tab ${tabIndex(id) + 1} of ${TABS.length}`;
}

/**
 * The bottom tab bar. Plain buttons: double tap (or the usual select gesture) to
 * switch. The selected one says so. No special gestures are needed.
 */
export function TabBar({ selected, onSelect }: { selected: TabId; onSelect: (id: TabId) => void }) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.id === selected;
        return (
          <Pressable
            key={t.id}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={[styles.tab, on && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(t.id)}
          >
            <Text style={[styles.text, on && styles.textOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginHorizontal: 2 },
  tabOn: { backgroundColor: colors.accent },
  text: { color: colors.dim, fontSize: 14, fontWeight: '600' },
  textOn: { color: '#000' },
});
