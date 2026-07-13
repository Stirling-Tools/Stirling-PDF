// Device-local (localStorage) category structure for the Files sidebar: which parent
// categories exist, their name/icon/order, and which labels roll up into each. It's an editable
// override of the built-in LABEL_FAMILIES default — until the user customizes it, the default is
// used verbatim (so the store stays empty and the default can evolve). A label may sit in more
// than one category (multi-membership); a category with `hidden` set stays defined but isn't shown
// as a sidebar group. This is presentational only — the classifier never sees categories.

import { LABEL_FAMILIES } from "@app/data/classificationLabels";

export interface SidebarCategory {
  /** Stable id — built-ins reuse their family id; custom ones get `custom:<n>`. */
  id: string;
  name: string;
  icon: string;
  /** Label ids in this category (matches a file's stored classification ids). */
  labelKeys: string[];
  /** Defined but not rendered as a sidebar group. */
  hidden?: boolean;
}

// v2: labelKeys hold label ids (was lower-cased names in v1); bumping discards
// stale name-keyed prefs so they don't silently stop matching.
const STORAGE_KEY = "stirling.fileSidebarCategories.v2";
// Device-local set of label ids the user has hidden from the sidebar grouping —
// a hidden label forms no group and pulls no files into a category, so files
// carrying only hidden labels fall under "Other". Personal, like categories.
const HIDDEN_STORAGE_KEY = "stirling.fileSidebarHiddenLabels.v1";

/** The built-in default, derived from LABEL_FAMILIES. Fresh copy per call (callers may mutate). */
export function defaultCategories(): SidebarCategory[] {
  return LABEL_FAMILIES.map((family) => ({
    id: family.id,
    name: family.name,
    icon: family.icon,
    labelKeys: family.labels.map((label) => label.id),
  }));
}

function readStorage(): SidebarCategory[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((c): c is SidebarCategory => {
        const cat = c as Partial<SidebarCategory>;
        return (
          typeof cat.id === "string" &&
          typeof cat.name === "string" &&
          typeof cat.icon === "string" &&
          Array.isArray(cat.labelKeys)
        );
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        labelKeys: c.labelKeys.filter((k) => typeof k === "string"),
        hidden: c.hidden === true,
      }));
  } catch {
    return null;
  }
}

// null = using the built-in default (not yet customized). Cached so useSyncExternalStore sees a
// stable reference between writes.
let stored: SidebarCategory[] | null = readStorage();
const listeners = new Set<() => void>();

// Effective list, recomputed only on write so its identity is stable for memo/useSyncExternalStore.
let effective: SidebarCategory[] = stored ?? defaultCategories();

function recompute() {
  effective = stored ?? defaultCategories();
}

function write(next: SidebarCategory[]) {
  stored = next;
  recompute();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota/private-mode failures degrade to session-only categories.
  }
  for (const listener of listeners) listener();
}

export function getSidebarCategories(): SidebarCategory[] {
  return effective;
}

/** Replace the whole category list (for controlled editors that stage edits and
 *  commit the final array at once). Snapshots defensively so later mutation of
 *  the passed array can't corrupt the store. */
export function setSidebarCategories(next: SidebarCategory[]) {
  write(next.map((c) => ({ ...c, labelKeys: [...c.labelKeys] })));
}

// ---- hidden labels (device-local, shares the categories listener set) ----

function readHiddenStorage(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((k) => typeof k === "string")
      : [];
  } catch {
    return [];
  }
}

// Cached so useSyncExternalStore sees a stable reference between writes.
let effectiveHidden: string[] = readHiddenStorage();

export function getHiddenLabels(): string[] {
  return effectiveHidden;
}

/** Replace the hidden-label set (controlled editors stage then commit at once). */
export function setHiddenLabels(next: string[]) {
  effectiveHidden = [...new Set(next)];
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(effectiveHidden));
  } catch {
    // Quota/private-mode failures degrade to session-only hidden labels.
  }
  for (const listener of listeners) listener();
}

/** A stable id for a newly created custom category. Pure — safe for computing a
 *  next-state array without touching the store. */
export function makeCustomCategoryId(
  name: string,
  existing: SidebarCategory[],
): string {
  return `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${existing.length}`;
}

export function subscribeSidebarCategories(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hidden labels share the categories listener set, so this is the same subscribe. */
export const subscribeHiddenLabels = subscribeSidebarCategories;

export function isCustomized(): boolean {
  return stored !== null;
}

/** Map each label key to the ids of every VISIBLE category it belongs to. */
export function labelCategoryMap(
  categories: SidebarCategory[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const category of categories) {
    if (category.hidden) continue;
    for (const key of category.labelKeys) {
      const ids = map.get(key);
      if (ids) ids.push(category.id);
      else map.set(key, [category.id]);
    }
  }
  return map;
}

/** Set of every label key that belongs to any category (visible or not). */
export function categorizedLabelKeys(
  categories: SidebarCategory[],
): Set<string> {
  const keys = new Set<string>();
  for (const category of categories) {
    for (const key of category.labelKeys) keys.add(key);
  }
  return keys;
}

// ---- editing ----
// Category mutations go through the controlled ClassificationCategoryManager,
// which computes the next array and commits it via setSidebarCategories — so
// there are no per-field mutators here beyond the whole-list setter above.

/** Restore the built-in default categories and clear any hidden labels. */
export function resetSidebarCategories() {
  stored = null;
  recompute();
  effectiveHidden = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HIDDEN_STORAGE_KEY);
  } catch {
    // Quota/private-mode failures degrade to session-only prefs.
  }
  for (const listener of listeners) listener();
}
