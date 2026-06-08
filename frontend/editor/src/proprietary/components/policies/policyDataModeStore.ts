/**
 * Global data-source toggle for the Policies surface: "mock" shows the curated
 * demo activity/stats baked into the catalog; "live" derives them from each
 * policy's real backing-folder run state. A module store (read via
 * useSyncExternalStore) so the list toggle and the detail view stay in sync,
 * persisted to localStorage. This is the in-UI switch between mock and real
 * data — the same seam the backend will eventually feed.
 */

import { useSyncExternalStore } from "react";

export type PolicyDataMode = "mock" | "live";

const STORAGE_KEY = "stirling-policies-data-mode";

function read(): PolicyDataMode {
  try {
    return typeof localStorage !== "undefined" &&
      localStorage.getItem(STORAGE_KEY) === "live"
      ? "live"
      : "mock";
  } catch {
    return "mock";
  }
}

let state: PolicyDataMode = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot(): PolicyDataMode {
  return state;
}
function getServerSnapshot(): PolicyDataMode {
  return "mock";
}

export function setPolicyDataMode(mode: PolicyDataMode) {
  if (state === mode) return;
  state = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // best-effort
  }
  emit();
}

export function usePolicyDataMode(): PolicyDataMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
