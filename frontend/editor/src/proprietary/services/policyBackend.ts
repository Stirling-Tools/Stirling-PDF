/**
 * Backend source-of-truth read layer for Policies: fetch the stored policies
 * (grouped by catalog category) and decode them onto the frontend's per-category
 * state for the editor's enforcement path.
 *
 * The frontend is category-keyed (one policy per catalog category); the backend
 * is a flat list with assigned ids. The bridge is `trigger.options.categoryId`,
 * which `policyPipeline` decodes on read.
 */

import * as policyApi from "@app/services/policyApi";
import {
  fromBackendPolicy,
  type DecodedPolicy,
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
  // The backend returns policies in the team's run order; the list index IS the
  // order (server-side, shared team-wide), which we carry onto the decoded state.
  const stored = await policyApi.listPolicies();
  const byCategory = new Map<string, DecodedPolicy>();
  stored.forEach((policy, index) => {
    const decoded = fromBackendPolicy(policy);
    // A pipeline built on the Pipelines page has no category tile, so it keys by its own id
    // rather than being dropped - one set to run on the editor still has to reach the auto-run.
    const key = decoded.categoryId || decoded.id;
    if (key) byCategory.set(key, { ...decoded, order: index });
  });
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
    enabled: decoded.enabled,
    name: decoded.name,
    sources: decoded.sources,
    runsOnEditor: decoded.runsOnEditor,
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
    // Catalog-category policies are built-in defaults (not deletable); a builder pipeline is not.
    isDefault: Boolean(decoded.categoryId),
  };
}
