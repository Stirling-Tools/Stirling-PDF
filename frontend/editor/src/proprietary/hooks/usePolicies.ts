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
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import {
  createPolicyFolder,
  createPolicyFolderForAutomation,
  deletePolicyFolder,
  setPolicyFolderPaused,
  updatePolicyFolderSettings,
} from "@app/services/policyFolders";
import {
  MOCK_POLICY_USER,
  canConfigurePolicies,
} from "@app/data/policyDefinitions";
import type {
  PoliciesByCategory,
  PolicyWizardResult,
  SpendLimit,
} from "@app/types/policies";

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

  /**
   * Enable a policy: create its backing folder trigger (a Watch Folders
   * SmartFolder + automation seeded from the category preset) and record the
   * link. Reuses the Watch Folders engine for execution.
   */
  /**
   * Enable a new policy from the wizard result: link the saved workflow
   * automation to a backing folder and persist the collected settings.
   */
  const enablePolicy = useCallback(
    async (id: string, result: PolicyWizardResult) => {
      const category = loadPolicyCatalog().categories.find((c) => c.id === id);
      if (!category) return;
      const folder = await createPolicyFolderForAutomation(
        category,
        result.automation.id,
      );
      await updatePolicyFolderSettings(folder.id, result.folder);
      updatePolicy(id, {
        configured: true,
        status: "active",
        folderId: folder.id,
        fieldValues: result.fieldValues,
        sources: result.sources,
        scopeTypes: result.scopeTypes,
        reviewerEmail: result.reviewerEmail,
      });
    },
    [],
  );

  /**
   * Save edits from the wizard. The workflow automation is updated in place by
   * the builder; persist the folder's output/retry settings + the rest of the
   * policy's settings here.
   */
  const savePolicyConfig = useCallback(
    async (id: string, result: PolicyWizardResult) => {
      const folderId = loadPolicies()[id]?.folderId;
      if (folderId) await updatePolicyFolderSettings(folderId, result.folder);
      updatePolicy(id, {
        fieldValues: result.fieldValues,
        sources: result.sources,
        scopeTypes: result.scopeTypes,
        reviewerEmail: result.reviewerEmail,
      });
    },
    [],
  );

  const pausePolicy = useCallback(async (id: string) => {
    const folderId = loadPolicies()[id]?.folderId;
    if (folderId) await setPolicyFolderPaused(folderId, true);
    updatePolicy(id, { status: "paused" });
  }, []);

  const resumePolicy = useCallback(async (id: string) => {
    const folderId = loadPolicies()[id]?.folderId;
    if (folderId) await setPolicyFolderPaused(folderId, false);
    updatePolicy(id, { status: "active" });
  }, []);

  const deletePolicy = useCallback(async (id: string) => {
    const folderId = loadPolicies()[id]?.folderId;
    if (folderId) await deletePolicyFolder(folderId);
    resetPolicy(id);
  }, []);

  /**
   * Ensure a configured policy has a backing folder (its editable pipeline),
   * creating one from the preset if missing — e.g. the seeded policy, which is
   * active without ever having gone through enable. Returns the folder id.
   */
  const ensurePolicyFolder = useCallback(async (id: string) => {
    const existing = loadPolicies()[id]?.folderId;
    if (existing) return existing;
    const catalog = loadPolicyCatalog();
    const category = catalog.categories.find((c) => c.id === id);
    const config = catalog.configs[id];
    if (!category || !config) return undefined;
    const folder = await createPolicyFolder(category, config.defaultOperations);
    updatePolicy(id, { folderId: folder.id });
    return folder.id;
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
    savePolicyConfig,
    pausePolicy,
    resumePolicy,
    deletePolicy,
    ensurePolicyFolder,
  };
}
