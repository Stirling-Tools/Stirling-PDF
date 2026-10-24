import { fromWirePolicy } from "@app/policies/codec";
import { runsToActivity, runsToStats } from "@app/policies/runs";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type DecoratedPolicy,
  type PoliciesResponse,
  type PolicyState,
  type PolicyStatus,
} from "@app/policies/catalog";
import type {
  PolicyDecodedState,
  PolicyRunView,
  WirePolicy,
} from "@app/policies/types";

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
    name: decoded.name,
    icon: decoded.icon,
    outputIds: decoded.outputIds,
    routingRules: decoded.routingRules,
    status,
    required: decoded.required,
    extraOptions: decoded.extraOptions,
    sources: decoded.sources,
    trigger: decoded.trigger,
    inputs: decoded.inputs,
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

/** Combines saved policies and run history with the shared preset catalogue. */
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
