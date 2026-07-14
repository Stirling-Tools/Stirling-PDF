// The Files-sidebar categories are a fixed, built-in set shared by everyone (derived from
// LABEL_FAMILIES) — the team can't create, rename, or re-group them. The only per-user choice is
// which categories to SHOW or HIDE in the sidebar, kept device-local in localStorage. A hidden
// category isn't rendered as a group; its files fall to "Other". Presentational only — the
// classifier never sees categories.

import { LABEL_FAMILIES } from "@app/data/classificationLabels";

export interface SidebarCategory {
  /** Stable id (the label family's id). */
  id: string;
  name: string;
  icon: string;
  /** Label ids in this category (matches a file's stored classification ids). */
  labelKeys: string[];
  /** Hidden from the sidebar (device-local, personal). */
  hidden?: boolean;
}

const HIDDEN_STORAGE_KEY = "stirling.fileSidebarHiddenCategories.v1";

/** The fixed, shared category set — never mutated. */
const BASE_CATEGORIES: readonly Omit<SidebarCategory, "hidden">[] =
  LABEL_FAMILIES.map((family) => ({
    id: family.id,
    name: family.name,
    icon: family.icon,
    labelKeys: family.labels.map((label) => label.id),
  }));

function readHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

let hiddenIds = readHidden();
const listeners = new Set<() => void>();

// Recomputed only on write so its identity is stable for memo/useSyncExternalStore.
let effective: SidebarCategory[] = compute();

function compute(): SidebarCategory[] {
  return BASE_CATEGORIES.map((c) => ({
    ...c,
    labelKeys: [...c.labelKeys],
    hidden: hiddenIds.has(c.id),
  }));
}

function persist() {
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenIds]));
  } catch {
    // Quota/private-mode failures degrade to session-only visibility.
  }
  effective = compute();
  for (const listener of listeners) listener();
}

/** The shared categories, each flagged with the user's device-local visibility. */
export function getSidebarCategories(): SidebarCategory[] {
  return effective;
}

/** Show or hide a category in this device's sidebar. */
export function setCategoryHidden(id: string, hidden: boolean) {
  if (hidden) hiddenIds.add(id);
  else hiddenIds.delete(id);
  persist();
}

export function subscribeSidebarCategories(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Show every category again (clear the device-local hidden set). */
export function resetHiddenCategories() {
  hiddenIds = new Set();
  persist();
}
