/**
 * Shared fixtures for the policy component stories — a configured, decorated
 * policy built straight from the catalogue + seed data, so stories render the
 * same shapes the MSW handlers serve without standing up the whole API.
 */
import { fromWirePolicy } from "@shared/policies/codec";
import { runsToActivity, runsToStats } from "@shared/policies/runs";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  seedPolicies,
  seedPolicyRuns,
  type DecoratedPolicy,
  type PolicyState,
} from "@portal/mocks/policies";

export { POLICY_CATEGORIES, POLICY_CONFIG };

/** A decorated, active policy for a category, mirroring fetchPolicies() assembly. */
export function decorateForStory(categoryId: string): DecoratedPolicy {
  const category = POLICY_CATEGORIES.find((c) => c.id === categoryId)!;
  const config = POLICY_CONFIG[categoryId];

  // Use the seeded security policy for any category (story only needs the shape).
  const wire = seedPolicies()[0];
  const decoded = fromWirePolicy(wire);
  const allRuns = seedPolicyRuns();
  const policyRuns = allRuns.filter((r) => r.policyId === wire.id);

  const state: PolicyState = {
    configured: true,
    status: decoded.enabled ? "active" : "paused",
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
    backendId: wire.id,
    isDefault: true,
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
