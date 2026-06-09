/**
 * Local persistence for Policies. localStorage-backed stand-in for the future
 * server API — keeps per-category state (configured/active/paused, sources,
 * scope, reviewer, field overrides) and broadcasts changes so hooks re-render.
 * Mirrors the change-event pattern of the automation/folder stores.
 */

import { loadPolicyCatalog } from "@app/services/policyCatalog";
import type { PoliciesByCategory, PolicyState } from "@app/types/policies";

const STORAGE_KEY = "stirling-policies-state";
export const POLICIES_CHANGE_EVENT = "stirling:policies-changed";

function defaultState(categoryId: string): PolicyState {
  // The catalog flags which policy ships pre-configured + active (immediate
  // value, non-threatening) — data-driven, no hardcoded category id.
  const category = loadPolicyCatalog().categories.find(
    (c) => c.id === categoryId,
  );
  const active = category?.defaultActive ?? false;
  return {
    configured: active,
    status: active ? "active" : "default",
    sources: ["editor"],
    scopeTypes: [],
    // Empty by default; the wizard defaults the reviewer to the signed-in user.
    reviewerEmail: "",
    fieldValues: {},
  };
}

/** The removed mock user's email, scrubbed from any persisted state on read. */
const STALE_MOCK_REVIEWER = "matt@stirlingpdf.com";

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
    const merged = { ...defaultState(cat.id), ...(parsed[cat.id] ?? {}) };
    // Migration: scrub the removed mock user's email so the reviewer re-defaults
    // to the real signed-in user instead of the persisted "matt@stirlingpdf.com".
    if (merged.reviewerEmail === STALE_MOCK_REVIEWER) merged.reviewerEmail = "";
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
    // Best-effort; ignore quota/availability failures in the mock.
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

/** Reset a category to its unconfigured default (the "Delete policy" action). */
export function resetPolicy(categoryId: string): PoliciesByCategory {
  return updatePolicy(categoryId, {
    ...defaultState(categoryId),
    configured: false,
    status: "default",
    // Drop the backing-folder link (the caller deletes the folder itself).
    folderId: undefined,
  });
}

/** Subscribe to policy-state changes (same-tab). Returns an unsubscribe fn. */
export function onPoliciesChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(POLICIES_CHANGE_EVENT, cb);
  return () => window.removeEventListener(POLICIES_CHANGE_EVENT, cb);
}
