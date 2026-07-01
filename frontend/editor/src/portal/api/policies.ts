/**
 * Policies service layer.
 *
 * The portal calls the real Stirling policy API (`/api/v1/policies`). MSW
 * intercepts these calls in dev/Storybook; dropping MSW is enough to hit the
 * live backend — no call-site changes needed.
 *
 * `fetchPolicies()` assembles the decorated catalogue client-side from the
 * backend's flat `WirePolicy[]` + `PolicyRunView[]`, mirroring the same
 * approach the editor uses for its own catalogue view.
 */

import { apiClient } from "@portal/api/http";
import { fromWirePolicy, toWirePolicy } from "@shared/policies/codec";
import { runsToActivity, runsToStats } from "@shared/policies/runs";
import type { PolicyDecodedState, WirePolicy } from "@shared/policies/types";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type DecoratedPolicy,
  type PoliciesResponse,
  type PoliciesSummary,
  type PolicySetupResult,
  type PolicyState,
  type PolicyStatus,
} from "@portal/mocks/policies";
import type { PolicyRunView } from "@shared/policies/types";

export type {
  CatalogueEntry,
  DecoratedPolicy,
  PoliciesResponse,
  PoliciesSummary,
  PolicyCategory,
  PolicyConfigDef,
  PolicyDecodedState,
  PolicyField,
  PolicyFieldType,
  PolicyRowStatus,
  PolicyRunView,
  PolicySetupResult,
  PolicyState,
  PolicyStats,
  PolicyActivityItem,
  PolicyStatus,
  WirePolicy,
  WireOutputOptions,
  WireOutputSpec,
} from "@portal/mocks/policies";
export {
  ENDPOINT_LABELS,
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  POLICY_DOC_TYPES,
  TOOL_ENDPOINTS,
  humanizeEndpoint,
} from "@portal/mocks/policies";

// Re-export the wire step type under the legacy name components depend on.
export type { WirePipelineStep as PipelineStep } from "@shared/policies/types";

// ── Client-side catalogue assembly ───────────────────────────────────────────

function decoratePolicy(
  decoded: PolicyDecodedState,
  runs: PolicyRunView[],
  isDefault: boolean,
): DecoratedPolicy | null {
  const category = POLICY_CATEGORIES.find((c) => c.id === decoded.categoryId);
  const config = POLICY_CONFIG[decoded.categoryId];
  if (!category || !config) return null;

  const policyRuns = runs.filter((r) => r.policyId === decoded.id);
  const status: PolicyStatus = decoded.enabled ? "active" : "paused";
  const state: PolicyState = {
    configured: true,
    status,
    sources: decoded.sources,
    scopeTypes: decoded.scopeTypes,
    reviewerEmail: decoded.reviewerEmail,
    fieldValues: decoded.fieldValues,
    outputMode: decoded.outputMode,
    outputName: decoded.outputName,
    outputNamePosition: decoded.outputNamePosition,
    runOn: decoded.runOn,
    maxRetries: decoded.maxRetries,
    retryDelayMinutes: decoded.retryDelayMinutes,
    backendId: decoded.id,
    isDefault,
  };

  return {
    category,
    config,
    state,
    steps: decoded.steps,
    stats: runsToStats(policyRuns),
    activity: runsToActivity(policyRuns),
  };
}

/** GET /api/v1/policies + GET /api/v1/policies/runs → assembled catalogue. */
export async function fetchPolicies(): Promise<PoliciesResponse> {
  const [wirePolicies, runs] = await Promise.all([
    apiClient.local.json<WirePolicy[]>("/api/v1/policies"),
    apiClient.local
      .json<PolicyRunView[]>("/api/v1/policies/runs")
      .catch(() => [] as PolicyRunView[]),
  ]);

  const decodedByCategory = new Map<
    string,
    { decoded: PolicyDecodedState; isDefault: boolean }
  >();
  for (const wire of wirePolicies) {
    const decoded = fromWirePolicy(wire);
    if (decoded.categoryId) {
      decodedByCategory.set(decoded.categoryId, { decoded, isDefault: false });
    }
  }

  const catalogue: CatalogueEntry[] = POLICY_CATEGORIES.map((category) => {
    const entry = decodedByCategory.get(category.id);
    const policy = entry
      ? decoratePolicy(entry.decoded, runs, entry.isDefault)
      : null;
    return { category, config: POLICY_CONFIG[category.id], policy };
  });

  const active = wirePolicies.filter((p) => p.enabled).length;
  const paused = wirePolicies.filter((p) => !p.enabled).length;
  const enabledPolicyIds = new Set(
    wirePolicies.filter((p) => p.enabled).map((p) => p.id),
  );
  const docsEnforced = runs.filter(
    (r) =>
      r.status === "COMPLETED" &&
      r.policyId != null &&
      enabledPolicyIds.has(r.policyId),
  ).length;
  const summary: PoliciesSummary = {
    active,
    paused,
    categories: POLICY_CATEGORIES.length,
    docsEnforced,
  };

  return { summary, catalogue };
}

/** GET /api/v1/policies/{id} — one stored policy's raw record. */
export async function fetchPolicy(id: string): Promise<WirePolicy> {
  return apiClient.local.json<WirePolicy>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
  );
}

/**
 * POST /api/v1/policies — create (blank id) or update (matched id). The
 * backend stamps owner + teamId server-side and returns the stored record.
 */
export async function savePolicy(wire: WirePolicy): Promise<WirePolicy> {
  return apiClient.local.json<WirePolicy>("/api/v1/policies", {
    method: "POST",
    body: wire,
  });
}

/** DELETE /api/v1/policies/{id} */
export async function deletePolicy(id: string): Promise<void> {
  await apiClient.local.json<void>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

// ── Wire-build helpers (so Policies.tsx doesn't need codec knowledge) ────────

const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 5;

// Catalogue policy bodies carry categoryId at the top level so the pipelines
// mock handler can discriminate them from raw pipeline saves on the shared
// POST /api/v1/policies endpoint. The real backend ignores unknown fields.
type CatalogueWireBody = WirePolicy & { categoryId: string };

/** Build a wire policy from a setup wizard result. */
export function buildWireFromSetup(
  entry: CatalogueEntry,
  result: PolicySetupResult,
  enabled = true,
): CatalogueWireBody {
  return {
    categoryId: entry.category.id,
    ...toWirePolicy({
      id: entry.policy?.state.backendId ?? "",
      name: `${entry.category.label} Policy`,
      enabled,
      categoryId: entry.category.id,
      sources: result.sources,
      scopeTypes: result.scopeTypes,
      reviewerEmail: result.reviewerEmail,
      fieldValues: result.fieldValues,
      runOn: result.runOn,
      outputMode: result.outputMode,
      outputName: result.outputName,
      outputNamePosition: result.outputNamePosition,
      maxRetries: result.maxRetries,
      retryDelayMinutes: result.retryDelayMinutes,
      steps: result.steps,
    }),
  };
}

/** Build a wire policy from an existing decorated policy (e.g. for pause/resume). */
export function buildWireFromState(
  entry: CatalogueEntry,
  policy: DecoratedPolicy,
  enabled: boolean,
): CatalogueWireBody {
  const s = policy.state;
  return {
    categoryId: entry.category.id,
    ...toWirePolicy({
      id: s.backendId ?? "",
      name: `${entry.category.label} Policy`,
      enabled,
      categoryId: entry.category.id,
      sources: s.sources,
      scopeTypes: s.scopeTypes,
      reviewerEmail: s.reviewerEmail,
      fieldValues: s.fieldValues,
      runOn: s.runOn ?? "upload",
      outputMode: s.outputMode ?? "new_version",
      outputName: s.outputName ?? "",
      outputNamePosition: s.outputNamePosition ?? "suffix",
      maxRetries: s.maxRetries ?? DEFAULT_RETRIES,
      retryDelayMinutes: s.retryDelayMinutes ?? DEFAULT_RETRY_DELAY,
      steps: policy.steps,
    }),
  };
}

/**
 * POST /api/v1/policies/{id}/run — trigger a stored policy immediately. The
 * real endpoint is multipart; the portal sends no files, relying on whatever
 * the backend has queued for this policy.
 */
export async function runPolicy(id: string): Promise<{ runId: string }> {
  return apiClient.local.json<{ runId: string }>(
    `/api/v1/policies/${encodeURIComponent(id)}/run`,
    { method: "POST" },
  );
}
