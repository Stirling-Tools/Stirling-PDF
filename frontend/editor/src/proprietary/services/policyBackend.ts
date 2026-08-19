/**
 * Category-shaped wrapper over `policyApi` + `policyPipeline`: the frontend is
 * category-keyed, the backend a flat list, bridged by `trigger.options.categoryId`.
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
 * Fetch and decode every stored policy, keyed by catalog category (last wins on a clash).
 * Builder-made pipelines have no categoryId, so they key by own id rather than being dropped.
 */
export async function fetchPoliciesByCategory(): Promise<
  Map<string, DecodedPolicy>
> {
  // List index IS the team's server-side run order, carried onto the decoded state.
  const stored = await policyApi.listPolicies();
  const byCategory = new Map<string, DecodedPolicy>();
  stored.forEach((policy, index) => {
    const decoded = fromBackendPolicy(policy);
    const key = decoded.categoryId || decoded.id;
    if (key) {
      byCategory.set(key, { ...decoded, order: index });
    }
  });
  return byCategory;
}

/**
 * Project a decoded policy onto per-category state. `folderId` is local-only (the
 * backend doesn't track it), so the caller passes it back in via `localFolderId`.
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
    outputNamePosition: decoded.folder.outputNamePosition,
    runOn: decoded.folder.runOn,
    folderId: localFolderId,
    backendId: decoded.id,
    // Server-side run-order position (team-wide); drives the settings reorder list.
    order: decoded.order,
    // Catalog-category policies are built-in defaults (not deletable).
    isDefault: true,
  };
}

/**
 * Backend id of a category's stored policy, so a save updates it rather than
 * duplicating - enforces one-per-category even if the local cache lost the link.
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
 * Flip `enabled` (pause/resume), which gates automatic triggering. Reads first so
 * the rest of the config survives the round-trip.
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
