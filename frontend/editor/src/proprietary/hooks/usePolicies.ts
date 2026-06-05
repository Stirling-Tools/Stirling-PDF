/**
 * State + actions for Policies, backed by the mock policyStorage. Exposes the
 * per-category state, lifecycle actions (enable/pause/resume/delete/save), the
 * permission flag, and the (read-only, mock) spend-limit derivation.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  loadPolicies,
  onPoliciesChange,
  updatePolicy,
  resetPolicy,
} from "@app/services/policyStorage";
import {
  MOCK_POLICY_USER,
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

/**
 * Spend limit is read-only mock state in the frontend — the real figure comes
 * from the billing backend. Kept as a module constant so every usePolicies()
 * instance reads identical state (no setter ⇒ no cross-instance desync). The
 * spend chip / paused-on-limit derivation stays wired for when it goes live.
 */
const SPEND_LIMIT: SpendLimit = {
  enabled: false,
  limit: 500,
  used: 0,
  period: "monthly",
};
const spendLimitReached =
  SPEND_LIMIT.enabled && SPEND_LIMIT.used >= SPEND_LIMIT.limit;
const spendLimitWarning =
  SPEND_LIMIT.enabled && SPEND_LIMIT.used >= SPEND_LIMIT.limit * 0.8;

export function usePolicies() {
  const [policies, setPolicies] = useState<PoliciesByCategory>(loadPolicies);

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

  const canConfigure = useMemo(
    () => canConfigurePolicies(MOCK_POLICY_USER),
    [],
  );

  return {
    policies,
    canConfigure,
    spendLimit: SPEND_LIMIT,
    spendLimitReached,
    spendLimitWarning,
    enablePolicy,
    updateConfig,
    pausePolicy,
    resumePolicy,
    deletePolicy,
  };
}
