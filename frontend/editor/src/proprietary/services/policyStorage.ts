/**
 * Local cache + offline fallback for Policies — the backend (/api/v1/policies)
 * is the source of truth. Holds per-category state (configured/active/paused,
 * sources, scope, reviewer, field overrides) and broadcasts changes so hooks
 * re-render. Mirrors the change-event pattern of the automation/folder stores.
 */

import { loadPolicyCatalog } from "@app/services/policyCatalog";
import type { PoliciesByCategory, PolicyState } from "@app/types/policies";

const STORAGE_KEY = "stirling-policies-state";
export const POLICIES_CHANGE_EVENT = "stirling:policies-changed";

function defaultState(): PolicyState {
  // Unconfigured by default. The backend is the source of truth for what's
  // actually configured + active; this is just the empty local-cache shape.
  return {
    configured: false,
    status: "default",
    sources: ["editor"],
    scopeTypes: [],
    // Empty by default; the wizard defaults the reviewer to the signed-in user.
    reviewerEmail: "",
    fieldValues: {},
    // Default to versioning the input file rather than spawning a separate one.
    outputMode: "new_version",
    // No rename by default — the output keeps the input's filename.
    outputName: "",
    // Enforce on upload by default; export enforcement is the alternative.
    runOn: "upload",
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
  for (const cat of loadPolicyCatalog().categories) {
    const merged = { ...defaultState(), ...(parsed[cat.id] ?? {}) };
    // Migration: clear the obsolete persisted reviewer email so it re-defaults
    // to the real signed-in user.
    if (merged.reviewerEmail === STALE_REVIEWER_EMAIL)
      merged.reviewerEmail = "";
    out[cat.id] = merged;
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
      ...defaultState(),
      ...current[categoryId],
      ...patch,
    },
  };
  persist(next);
  return next;
}

/** Reset a category to its unconfigured default (the "Delete policy" action). */
export function resetPolicy(categoryId: string): PoliciesByCategory {
  return updatePolicy(categoryId, {
    ...defaultState(),
    configured: false,
    status: "default",
    // Drop the backing-folder + backend links (the caller deletes those).
    folderId: undefined,
    backendId: undefined,
  });
}

/** Subscribe to policy-state changes (same-tab). Returns an unsubscribe fn. */
export function onPoliciesChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(POLICIES_CHANGE_EVENT, cb);
  return () => window.removeEventListener(POLICIES_CHANGE_EVENT, cb);
}
