/**
 * Which screen sections are open or closed. Saved with the other settings (global, not in scenes), so the
 * screen comes back the way you left it.
 *
 * mode 'default': every section is open except the ones that are rarely needed (see COLLAPSED_BY_DEFAULT).
 * mode 'collapsed' / 'expanded': set by the Collapse all / Expand all buttons.
 * `open` and `closed` are the sections you opened or closed yourself since; they win over the mode.
 */
export type SectionUi = {
  mode: 'default' | 'collapsed' | 'expanded';
  open: Record<string, boolean>;
  closed: Record<string, boolean>;
};

export const defaultSectionUi: SectionUi = { mode: 'default', open: {}, closed: {} };

/** Sections that start closed: settings you set once, or only when designing a sound. */
export const COLLAPSED_BY_DEFAULT =
  /^(?!MidiDancer: ).*: external synth|Ugly FX|Evolving patterns|Drum fills|Transition|Recurring sound|Keyboard shortcuts|MIDI controller|My apps|Levels and fades|Bass voice:|Bass breathing|Pad breathing|Drum breathing|More settings|Sound of /i;

export function isCollapsed(ui: SectionUi, id: string): boolean {
  if (ui.closed[id]) return true;
  if (ui.open[id]) return false;
  if (ui.mode === 'collapsed') return true;
  if (ui.mode === 'expanded') return false;
  return COLLAPSED_BY_DEFAULT.test(id);
}

/** Open it if it is closed, close it if it is open. */
export function toggleSection(ui: SectionUi, id: string): SectionUi {
  const wasCollapsed = isCollapsed(ui, id);
  const open = { ...ui.open };
  const closed = { ...ui.closed };
  delete open[id];
  delete closed[id];
  if (wasCollapsed) open[id] = true;
  else closed[id] = true;
  return { ...ui, open, closed };
}

export const collapseAll: SectionUi = { mode: 'collapsed', open: {}, closed: {} };
export const expandAll: SectionUi = { mode: 'expanded', open: {}, closed: {} };

export function parseSectionUi(json: string): SectionUi {
  try {
    return cleanSectionUi(JSON.parse(json));
  } catch {
    return defaultSectionUi;
  }
}

/** Defence for saved data of an unknown shape. */
export function cleanSectionUi(raw: unknown): SectionUi {
  const r = (raw ?? {}) as Partial<SectionUi>;
  const rec = (v: unknown) => {
    const out: Record<string, boolean> = {};
    if (v && typeof v === 'object') for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (val === true) out[k] = true;
    return out;
  };
  const mode = r.mode === 'collapsed' || r.mode === 'expanded' ? r.mode : 'default';
  return { mode, open: rec(r.open), closed: rec(r.closed) };
}
