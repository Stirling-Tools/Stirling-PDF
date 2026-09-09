/**
 * Policies service layer.
 *
 * The portal calls the real Stirling policy API (`/api/v1/policies`);
 * Storybook and tests intercept the same calls with MSW handlers.
 *
 * The flat `WirePolicy[]` + `PolicyRunView[]` responses are assembled into the
 * decorated catalogue client-side by `assemblePolicies()`, mirroring the same
 * approach the editor uses for its own catalogue view.
 */

import type { TFunction } from "i18next";
import { apiClient } from "@portal/api/http";
import { fromWirePolicy, toWirePolicy } from "@app/policies/codec";
import { runsToActivity, runsToStats } from "@app/policies/runs";
import {
  policyStepFromWire,
  type PolicyToolId,
} from "@app/policies/operations";
import type { Policy } from "@portal/api/pipelines";
import type {
  PolicyDecodedState,
  PolicyRunView,
  WireOutputOptions,
  WirePipelineStep,
  WirePolicy,
} from "@app/policies/types";

export type { PolicyRunView, WirePolicy } from "@app/policies/types";

/* Catalogue model + definitions live in @app/policies/catalog - shared with the
   editor's folder-processing setup - and are re-exported here for the portal. */
export * from "@app/policies/catalog";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type DecoratedPolicy,
  type PoliciesResponse,
  type PolicySetupResult,
  type PolicyState,
  type PolicyStatus,
} from "@app/policies/catalog";

// ── Client-side catalogue assembly ───────────────────────────────────────────

function decoratePolicy(
  decoded: PolicyDecodedState,
  runs: PolicyRunView[],
  isDefault: boolean,
): DecoratedPolicy | null {
  const category = POLICY_CATEGORIES.find((c) => c.id === decoded.policyKey);
  const config = POLICY_CONFIG[decoded.policyKey];
  if (!category || !config) return null;

  const policyRuns = runs.filter((r) => r.policyId === decoded.id);
  const status: PolicyStatus = decoded.enabled ? "active" : "paused";
  const state: PolicyState = {
    configured: true,
    status,
    required: decoded.required,
    extraOptions: decoded.extraOptions,
    sources: decoded.sources,
    runsOnEditor: decoded.runsOnEditor,
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

/** GET /api/v1/policies — the flat stored-policy records. */
export function fetchPoliciesList(): Promise<WirePolicy[]> {
  return apiClient.local.json<WirePolicy[]>("/api/v1/policies");
}

/** GET /api/v1/policies/runs — best-effort (empty on a backend without runs). */
export function fetchPolicyRuns(): Promise<PolicyRunView[]> {
  return apiClient.local
    .json<PolicyRunView[]>("/api/v1/policies/runs")
    .catch(() => [] as PolicyRunView[]);
}

/**
 * Pure assembly of the decorated catalogue from the two raw responses. Split
 * out so the React Query layer can fetch the list + runs as separate shared
 * cache entries (deduped across Home + Policies) and assemble client-side.
 */
export function assemblePolicies(
  wirePolicies: WirePolicy[],
  runs: PolicyRunView[],
): PoliciesResponse {
  const decodedByCategory = new Map<
    string,
    { decoded: PolicyDecodedState; isDefault: boolean }
  >();
  for (const wire of wirePolicies) {
    const decoded = fromWirePolicy(wire);
    if (decoded.policyKey) {
      decodedByCategory.set(decoded.policyKey, { decoded, isDefault: false });
    }
  }

  const catalogue: CatalogueEntry[] = POLICY_CATEGORIES.map((category) => {
    const entry = decodedByCategory.get(category.id);
    const policy = entry
      ? decoratePolicy(entry.decoded, runs, entry.isDefault)
      : null;
    return { category, config: POLICY_CONFIG[category.id], policy };
  });

  return { catalogue };
}

/**
 * Whether `inner` appears in `outer` in order (no reordering), each used once. The wizard renders
 * a category's capabilities in a fixed order, so a policy whose enabled tools are a subsequence of
 * the template's canonical chain round-trips; any other order cannot be shown simply.
 */
function isOrderedSubset<T>(inner: T[], outer: T[]): boolean {
  let cursor = 0;
  for (const item of inner) {
    const at = outer.indexOf(item, cursor);
    if (at === -1) return false;
    cursor = at + 1;
  }
  return true;
}

/**
 * The CatalogueEntry that seeds the simple wizard for a policy, or null if the wizard can't express
 * it losslessly - the single authority for routing an edit to the wizard vs the full builder. Null on
 * anything the wizard can't show: no template origin, a server input/destination, an unknown or extra
 * tool, or a reordered chain.
 */
export function parseSimplePolicy(
  policy: Policy,
  runs: PolicyRunView[] = [],
): CatalogueEntry | null {
  const rawCategory = policy.output?.options?.categoryId;
  const categoryId = typeof rawCategory === "string" ? rawCategory : "";
  if (!categoryId) return null;
  const category = POLICY_CATEGORIES.find((c) => c.id === categoryId);
  const config = POLICY_CONFIG[categoryId];
  if (!category || !config) return null;

  // The wizard only runs on the editor (sources + runOn live in the options bag, not as server
  // inputs/destinations). A policy carrying either cannot be shown simply.
  if ((policy.inputs?.length ?? 0) > 0) return null;
  if ((policy.outputIds?.length ?? 0) > 0) return null;

  // Every step must be one of this template's capabilities, and they must stay in canonical order.
  const canonical = config.defaultOperations.map((op) => op.toolId);
  const toolIds: PolicyToolId[] = [];
  for (const step of policy.steps) {
    const parsed = policyStepFromWire(step as WirePipelineStep);
    if (!parsed || !canonical.includes(parsed.toolId)) return null;
    toolIds.push(parsed.toolId);
  }
  if (!isOrderedSubset(toolIds, canonical)) return null;

  const wire: WirePolicy = {
    id: policy.id ?? "",
    name: policy.name,
    enabled: policy.enabled,
    required: policy.required,
    trigger: null,
    steps: policy.steps as WirePipelineStep[],
    // The options bag is untyped on the pipeline record; the codec reads it defensively.
    output: {
      type: "inline",
      options: (policy.output?.options ?? {}) as Partial<WireOutputOptions>,
    },
    editor: policy.editor,
  };
  const decorated = decoratePolicy(fromWirePolicy(wire), runs, false);
  if (!decorated) return null;
  // The wire codec models neither the icon nor the (custom) name; carry them from the raw record so
  // the Customise hand-off preserves them instead of resetting to the category default.
  return {
    category,
    config,
    policy: {
      ...decorated,
      state: { ...decorated.state, name: policy.name, icon: policy.icon },
    },
  };
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

/**
 * DELETE /api/v1/policies/{id}/processed-history — forget which source files
 * the policy has processed, so its next sweep reprocesses everything present.
 */
export async function clearProcessedHistory(id: string): Promise<void> {
  await apiClient.local.json<void>(
    `/api/v1/policies/${encodeURIComponent(id)}/processed-history`,
    {
      method: "DELETE",
    },
  );
}

// ── Wire-build helpers (so Policies.tsx doesn't need codec knowledge) ────────

// Catalogue policy bodies carry categoryId at the top level so the pipelines
// mock handler can discriminate them from raw pipeline saves on the shared
// POST /api/v1/policies endpoint. The real backend ignores unknown fields.
type CatalogueWireBody = WirePolicy & { categoryId: string; icon?: string };

/**
 * The persisted policy name derived from its category, e.g. "Security Policy".
 * `category.label` is an i18n key, so translate it before building the name;
 * otherwise the raw key is persisted and surfaces in the UI (e.g. the Sources
 * "Used by" pill).
 */
function policyDisplayName(entry: CatalogueEntry, t: TFunction): string {
  return t("portal.policies.defaultName", {
    category: t(entry.category.label),
  });
}

/** Build a wire policy from a setup wizard result. */
export function buildWireFromSetup(
  entry: CatalogueEntry,
  result: PolicySetupResult,
  t: TFunction,
  enabled = true,
): CatalogueWireBody {
  const stored = entry.policy?.state;
  return {
    categoryId: entry.category.id,
    icon: stored?.icon,
    ...toWirePolicy({
      id: stored?.backendId ?? "",
      name: stored?.name ?? policyDisplayName(entry, t),
      enabled,
      required: result.required,
      extraOptions: result.extraOptions,
      policyKey: entry.category.id,
      sources: result.sources,
      runsOnEditor: result.runsOnEditor,
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
