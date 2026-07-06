/**
 * Device-local preference for WHICH groups the Files sidebar shows (a view
 * preference, so localStorage — not synced across devices or users' teams).
 *
 * Stored as deltas from the default, so the default can evolve without
 * clobbering choices:
 *  - `hiddenGroups` — group ids switched OFF that are on by default
 *    (family groups `family:<id>`, custom-label groups `label:<name>`).
 *  - `enabledLabels` — built-in label names (lower-cased) switched ON as their
 *    own standalone groups (off by default; their family covers them).
 *
 * Default view: every {@link LABEL_FAMILIES} family as one group, plus a group
 * per custom (non-built-in) label. "Recent" and "Other" are not configurable.
 */

export interface FileSidebarGroupPrefs {
  hiddenGroups: readonly string[];
  enabledLabels: readonly string[];
}

const STORAGE_KEY = "stirling.fileSidebarGroups.v1";

const DEFAULT_PREFS: FileSidebarGroupPrefs = {
  hiddenGroups: [],
  enabledLabels: [],
};

function readStorage(): FileSidebarGroupPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<FileSidebarGroupPrefs>;
    const strings = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [];
    return {
      hiddenGroups: strings(parsed.hiddenGroups),
      enabledLabels: strings(parsed.enabledLabels),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// Snapshot cached so useSyncExternalStore sees a stable reference between writes.
let snapshot: FileSidebarGroupPrefs = readStorage();
const listeners = new Set<() => void>();

function write(next: FileSidebarGroupPrefs) {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota/private-mode failures degrade to session-only prefs.
  }
  for (const listener of listeners) listener();
}

export function getFileSidebarGroupPrefs(): FileSidebarGroupPrefs {
  return snapshot;
}

export function subscribeFileSidebarGroupPrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Show/hide a default-on group (family or custom label). */
export function setGroupHidden(groupId: string, hidden: boolean) {
  const current = new Set(snapshot.hiddenGroups);
  if (hidden) current.add(groupId);
  else current.delete(groupId);
  write({ ...snapshot, hiddenGroups: [...current] });
}

/** Turn a built-in label on/off as its own standalone sidebar group. */
export function setLabelEnabled(labelName: string, enabled: boolean) {
  const key = labelName.toLowerCase();
  const current = new Set(snapshot.enabledLabels);
  if (enabled) current.add(key);
  else current.delete(key);
  write({ ...snapshot, enabledLabels: [...current] });
}

export function resetFileSidebarGroupPrefs() {
  write(DEFAULT_PREFS);
}
