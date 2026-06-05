/**
 * Tiny external store for the currently-selected policy and its detail sub-view.
 *
 * The Policies surface is split across two slots in the right tool sidebar — the
 * list section (above Tools) and the detail takeover (which replaces Tools when a
 * policy is open) — plus the collapsed-rail icons. They live in different parts of
 * {@code RightSidebar}'s tree, so selection can't be component-local useState.
 * This module-level store (read via {@code useSyncExternalStore}) lets all three
 * stay in sync without threading a context through the core sidebar.
 */

import { useSyncExternalStore } from "react";
import type { PolicyDetailView } from "@app/types/policies";

interface PolicySelection {
  selectedId: string | null;
  detailView: PolicyDetailView;
}

let state: PolicySelection = { selectedId: null, detailView: "detail" };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PolicySelection {
  return state;
}

/** Deterministic initial snapshot for SSR/hydration (never the mutable store). */
const SERVER_SNAPSHOT: PolicySelection = {
  selectedId: null,
  detailView: "detail",
};
function getServerSnapshot(): PolicySelection {
  return SERVER_SNAPSHOT;
}

/** Open a policy's detail (resets the sub-view to the narrative). */
export function selectPolicy(id: string | null) {
  state = { selectedId: id, detailView: "detail" };
  emit();
}

/** Switch the open policy between its narrative and edit-settings sub-views. */
export function setPolicyDetailView(view: PolicyDetailView) {
  if (state.detailView === view) return;
  state = { ...state, detailView: view };
  emit();
}

/** Close the open policy and return to the list. */
export function closePolicy() {
  selectPolicy(null);
}

/** Reset to the initial state — used by tests to isolate the module store. */
export function resetPolicySelection() {
  state = { selectedId: null, detailView: "detail" };
  emit();
}

export function usePolicySelection(): PolicySelection {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
