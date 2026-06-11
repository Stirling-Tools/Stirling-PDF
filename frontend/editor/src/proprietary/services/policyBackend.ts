/**
 * Backend source-of-truth layer for Policies. Wraps the raw `policyApi` client +
 * the `policyPipeline` mapper into category-shaped operations the hook can use:
 * fetch the stored policies (grouped by catalog category), persist one, flip its
 * enabled flag, and delete it.
 *
 * The frontend is category-keyed (one policy per catalog category); the backend
 * is a flat list with assigned ids. The bridge is `trigger.options.categoryId`,
 * which `policyPipeline` encodes on save and decodes on read.
 */

import * as policyApi from "@app/services/policyApi";
import {
  buildBackendPolicy,
  fromBackendPolicy,
  type DecodedPolicy,
  type PolicyToStore,
} from "@app/services/policyPipeline";
import type { PolicyState } from "@app/types/policies";

/**
 * Fetch every stored policy and decode it, keyed by its catalog category. If two
 * stored policies share a category (shouldn't happen — one per category), the
 * last one wins; policies with no recognised categoryId are skipped.
 */
export async function fetchPoliciesByCategory(): Promise<
  Map<string, DecodedPolicy>
> {
  const stored = await policyApi.listPolicies();
  const byCategory = new Map<string, DecodedPolicy>();
  for (const policy of stored) {
    const decoded = fromBackendPolicy(policy);
    if (decoded.categoryId) byCategory.set(decoded.categoryId, decoded);
  }
  return byCategory;
}

/**
 * Project a decoded backend policy onto the frontend per-category state. The
 * locally-cached `folderId` (the editable-automation link, which the backend
 * doesn't track) is preserved by the caller via `localFolderId`.
 */
export function decodedToState(
  decoded: DecodedPolicy,
  localFolderId: string | undefined,
): PolicyState {
  return {
    configured: true,
    status: decoded.enabled ? "active" : "paused",
    sources: decoded.sources,
    scopeTypes: decoded.scopeTypes,
    reviewerEmail: decoded.reviewerEmail,
    fieldValues: decoded.fieldValues,
    outputMode: decoded.folder.outputMode,
    outputName: decoded.folder.outputName,
    runOn: decoded.folder.runOn,
    folderId: localFolderId,
    backendId: decoded.id,
    // Catalog-category policies are built-in defaults (not deletable).
    isDefault: true,
  };
}

/**
 * The backend id of the stored policy for a category, if one exists. Used to
 * enforce one-policy-per-category: a save reuses this id (update) rather than
 * creating a duplicate, even if the local cache lost the link.
 */
export async function findBackendId(
  categoryId: string,
): Promise<string | undefined> {
  const byCategory = await fetchPoliciesByCategory();
  return byCategory.get(categoryId)?.id;
}

/** Persist a policy (create or update); returns the backend-assigned id. */
export async function persistPolicy(store: PolicyToStore): Promise<string> {
  const saved = await policyApi.savePolicy(buildBackendPolicy(store));
  return saved.id;
}

/**
 * Flip a stored policy's `enabled` flag (pause/resume) — the backend gates
 * automatic triggering on it. Reads the current policy so the rest of its config
 * is preserved on the round-trip.
 */
export async function setPolicyEnabled(
  backendId: string,
  enabled: boolean,
): Promise<void> {
  const current = await policyApi.getPolicy(backendId);
  await policyApi.savePolicy({ ...current, enabled });
}

/** Delete a stored policy by its backend id. */
export async function removePolicy(backendId: string): Promise<void> {
  await policyApi.deletePolicy(backendId);
}
