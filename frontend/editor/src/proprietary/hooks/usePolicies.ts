/**
 * State + actions for Policies, backed by the mock policyStorage. Exposes the
 * per-category state, lifecycle actions (enable/pause/resume/delete/save), the
 * mock user/billing context for the permission + cost UI, and the derived
 * active-policy count + per-document cost.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  loadPolicies,
  onPoliciesChange,
  updatePolicy,
  resetPolicy,
} from "@app/services/policyStorage";
import {
  POLICY_CATEGORIES,
  PER_POLICY_DOC_COST,
  MOCK_POLICY_USER,
  MOCK_POLICY_BILLING,
  canConfigurePolicies,
} from "@app/data/policyDefinitions";
import type {
  PoliciesByCategory,
  PolicyState,
  SpendLimit,
} from "@app/types/policies";

/** Fields captured by the setup wizard when a policy is enabled. */
export interface PolicyEnableInput {
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
}

export function usePolicies() {
  const [policies, setPolicies] = useState<PoliciesByCategory>(loadPolicies);
  const [spendLimit, setSpendLimit] = useState<SpendLimit>({
    enabled: false,
    limit: 500,
    used: 0,
    period: "monthly",
  });

  useEffect(() => onPoliciesChange(() => setPolicies(loadPolicies())), []);

  const enablePolicy = useCallback((id: string, input: PolicyEnableInput) => {
    updatePolicy(id, {
      configured: true,
      status: "active",
      sources: input.sources,
      scopeTypes: input.scopeTypes,
      reviewerEmail: input.reviewerEmail,
      fieldValues: input.fieldValues,
    });
  }, []);

  const updateConfig = useCallback(
    (id: string, fieldValues: Record<string, boolean | string | string[]>) => {
      updatePolicy(id, { fieldValues });
    },
    [],
  );

  const setStatus = useCallback((id: string, status: PolicyState["status"]) => {
    updatePolicy(id, { status });
  }, []);

  const pausePolicy = useCallback(
    (id: string) => setStatus(id, "paused"),
    [setStatus],
  );
  const resumePolicy = useCallback(
    (id: string) => setStatus(id, "active"),
    [setStatus],
  );
  const deletePolicy = useCallback((id: string) => {
    resetPolicy(id);
  }, []);

  const activePolicyCount = useMemo(
    () =>
      POLICY_CATEGORIES.filter(
        (c) =>
          policies[c.id]?.configured && policies[c.id]?.status === "active",
      ).length,
    [policies],
  );

  const perDocCost = useMemo(
    () =>
      activePolicyCount > 0
        ? PER_POLICY_DOC_COST * activePolicyCount
        : PER_POLICY_DOC_COST,
    [activePolicyCount],
  );

  const spendLimitReached =
    spendLimit.enabled && spendLimit.used >= spendLimit.limit;
  const spendLimitWarning =
    spendLimit.enabled && spendLimit.used >= spendLimit.limit * 0.8;

  const canConfigure = useMemo(
    () => canConfigurePolicies(MOCK_POLICY_USER),
    [],
  );

  return {
    policies,
    user: MOCK_POLICY_USER,
    billing: MOCK_POLICY_BILLING,
    canConfigure,
    activePolicyCount,
    perDocCost,
    spendLimit,
    setSpendLimit,
    spendLimitReached,
    spendLimitWarning,
    enablePolicy,
    updateConfig,
    pausePolicy,
    resumePolicy,
    deletePolicy,
  };
}
