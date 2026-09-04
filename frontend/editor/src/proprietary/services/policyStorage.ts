/**
 * Local cache + offline fallback for Policies — the backend (/api/v1/policies)
 * is the source of truth. Holds per-category state (configured/active/paused,
 * sources, scope, reviewer, field overrides) and broadcasts changes so hooks
 * re-render. Mirrors the change-event pattern of the automation/folder stores.
 */

import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { defaultRunOn } from "@app/policies/runOn";
import type { PoliciesByCategory, PolicyState } from "@app/types/policies";

const STORAGE_KEY = "stirling-policies-state";
export const POLICIES_CHANGE_EVENT = "stirling:policies-changed";

function defaultState(categoryId: string): PolicyState {
  // Unconfigured by default. The backend is the source of truth for what's
  // actually configured + active; this is just the empty local-cache shape.
  return {
    configured: false,
    enabled: false,
    sources: ["editor"],
    runsOnEditor: true,
    scopeTypes: [],
    // Empty by default; the wizard defaults the reviewer to the signed-in user.
    reviewerEmail: "",
    fieldValues: {},
    // Default to versioning the input file rather than spawning a separate one.
    outputMode: "new_version",
    // No rename by default — the output keeps the input's filename.
    outputName: "",
    runOn: defaultRunOn(categoryId),
    // Every catalog category is a shipped, built-in policy → default (not
    // deletable).
    isDefault: true,
  };
}

/** An obsolete reviewer email scrubbed from persisted state on read so it can
 *  re-default to the real signed-in user. */
const STALE_REVIEWER_EMAIL = "matt@stirlingpdf.com";

/** Read the full policy state, seeding + healing any missing categories. */
export function loadPolicies(): PoliciesByCategory {
  let parsed: Partial<PoliciesByCategory> = {};
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    if (raw) parsed = JSON.parse(raw) as Partial<PoliciesByCategory>;
  } catch {
    // Corrupt/unavailable storage — fall back to seed.
  }
  // Always reconcile against the current category list so a newly-added
  // category gets a default rather than being undefined.
  const out: PoliciesByCategory = {};
  loadPolicyCatalog().categories.forEach((cat, index) => {
    const stored = parsed[cat.id];
    const merged = { ...defaultState(cat.id), ...(stored ?? {}) };
    // Migration: a row stored before runsOnEditor existed has no such field, so the default (true)
    // would put a tile narrowed to non-editor sources on the editor until the first reconcile lands.
    // Derive it from the legacy signal (the editor in its sources), mirroring the decode rule.
    if (stored && stored.runsOnEditor === undefined) {
      merged.runsOnEditor = (stored.sources ?? []).includes("editor");
    }
    // Migration: clear the obsolete persisted reviewer email so it re-defaults
    // to the real signed-in user.
    if (merged.reviewerEmail === STALE_REVIEWER_EMAIL)
      merged.reviewerEmail = "";
    // Default execution order to the catalog position until an admin reorders,
    // so ordered dispatch is deterministic before any explicit order is set.
    if (merged.order == null) merged.order = index;
    out[cat.id] = merged;
  });
  // Builder pipelines key by their own id, so the walk above misses them. Carried through as
  // stored: a tile's defaults would mark them built-in and put them on the editor uninvited.
  for (const [key, state] of Object.entries(parsed)) {
    if (!out[key] && state) out[key] = state as PolicyState;
  }
  return out;
}

function persist(state: PoliciesByCategory): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Best-effort; ignore quota/availability failures.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(POLICIES_CHANGE_EVENT));
  }
}

/** Merge a partial update into one category's state and persist. */
export function updatePolicy(
  categoryId: string,
  patch: Partial<PolicyState>,
): PoliciesByCategory {
  const current = loadPolicies();
  const next: PoliciesByCategory = {
    ...current,
    // Fall back to defaults so a not-yet-seeded category id still yields a
    // complete PolicyState rather than a partial.
    [categoryId]: {
      ...defaultState(categoryId),
      ...current[categoryId],
      ...patch,
    },
  };
  persist(next);
  return next;
}

/**
 * Drop cached entries entirely (no default seeded back). For builder pipelines the backend has
 * deleted: keyed by their own id, they have no built-in category to fall back to, so a left-behind
 * entry keeps a dead backendId that the auto-run still tries to dispatch. Built-in categories are
 * never forgotten - they reseed on the next read anyway.
 */
export function forgetPolicies(ids: string[]): PoliciesByCategory {
  const current = loadPolicies();
  const catalogIds = new Set(loadPolicyCatalog().categories.map((c) => c.id));
  const next: PoliciesByCategory = { ...current };
  let removed = false;
  for (const id of ids) {
    if (catalogIds.has(id) || !(id in next)) continue;
    delete next[id];
    removed = true;
  }
  if (removed) persist(next);
  return next;
}

/** Subscribe to policy-state changes (same-tab). Returns an unsubscribe fn. */
export function onPoliciesChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(POLICIES_CHANGE_EVENT, cb);
  return () => window.removeEventListener(POLICIES_CHANGE_EVENT, cb);
}
