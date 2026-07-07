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
  /** Lower-cased label names in this category. */
  labelKeys: string[];
  /** Defined but not rendered as a sidebar group. */
  hidden?: boolean;
}

const STORAGE_KEY = "stirling.fileSidebarCategories.v1";

/** The built-in default, derived from LABEL_FAMILIES. Fresh copy per call (callers may mutate). */
export function defaultCategories(): SidebarCategory[] {
  return LABEL_FAMILIES.map((family) => ({
    id: family.id,
    name: family.name,
    icon: family.icon,
    labelKeys: family.labels.map((label) => label.name.toLowerCase()),
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

/** Mutate the current effective list (snapshotting the default on first edit). */
function mutate(fn: (categories: SidebarCategory[]) => SidebarCategory[]) {
  write(fn(effective.map((c) => ({ ...c, labelKeys: [...c.labelKeys] }))));
}

export function getSidebarCategories(): SidebarCategory[] {
  return effective;
}

export function subscribeSidebarCategories(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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

/** Create a new empty category; returns its id. */
export function addCategory(name: string, icon: string): string {
  const id = `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${
    effective.length
  }`;
  mutate((categories) => [...categories, { id, name, icon, labelKeys: [] }]);
  return id;
}

export function renameCategory(id: string, name: string) {
  mutate((categories) =>
    categories.map((c) => (c.id === id ? { ...c, name } : c)),
  );
}

export function setCategoryIcon(id: string, icon: string) {
  mutate((categories) =>
    categories.map((c) => (c.id === id ? { ...c, icon } : c)),
  );
}

export function setCategoryHidden(id: string, hidden: boolean) {
  mutate((categories) =>
    categories.map((c) => (c.id === id ? { ...c, hidden } : c)),
  );
}

export function deleteCategory(id: string) {
  mutate((categories) => categories.filter((c) => c.id !== id));
}

export function addLabelToCategory(id: string, labelName: string) {
  const key = labelName.toLowerCase();
  mutate((categories) =>
    categories.map((c) =>
      c.id === id && !c.labelKeys.includes(key)
        ? { ...c, labelKeys: [...c.labelKeys, key] }
        : c,
    ),
  );
}

export function removeLabelFromCategory(id: string, labelKey: string) {
  const key = labelKey.toLowerCase();
  mutate((categories) =>
    categories.map((c) =>
      c.id === id
        ? { ...c, labelKeys: c.labelKeys.filter((k) => k !== key) }
        : c,
    ),
  );
}

/** Restore the built-in default and clear the customized flag (undoes any prior `mutate`). */
export function resetSidebarCategories() {
  stored = null;
  recompute();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Quota/private-mode failures degrade to session-only categories.
  }
  for (const listener of listeners) listener();
}
