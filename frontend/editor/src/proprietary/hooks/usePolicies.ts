/**
 * State + actions for Policies. The backend (`/api/v1/policies`) is the source
 * of truth: on mount we reconcile the local cache against the stored policies,
 * and every lifecycle action (enable/save/pause/resume/delete) is mirrored to
 * the backend. localStorage is a fast-render cache + offline fallback; the
 * IndexedDB backing folder still holds the editable automation + run state.
 */

import { useState, useEffect, useCallback } from "react";
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
  fetchPoliciesByCategory,
  decodedToState,
  persistPolicy,
  setPolicyEnabled,
  removePolicy,
} from "@app/services/policyBackend";
import type { PolicyToStore } from "@app/services/policyPipeline";
import type {
  PoliciesByCategory,
  PolicyWizardResult,
} from "@app/types/policies";

/** Build the backend store-request for a category from a wizard result. */
function toStoreRequest(
  categoryId: string,
  categoryLabel: string,
  result: PolicyWizardResult,
  enabled: boolean,
  backendId: string | undefined,
): PolicyToStore {
  return {
    id: backendId,
    categoryId,
    name: `${categoryLabel} Policy`,
    enabled,
    automation: result.automation,
    pipelineSteps: result.pipelineSteps,
    sources: result.sources,
    scopeTypes: result.scopeTypes,
    reviewerEmail: result.reviewerEmail,
    fieldValues: result.fieldValues,
    folder: result.folder,
  };
}

export function usePolicies() {
  const [policies, setPolicies] = useState<PoliciesByCategory>(loadPolicies);

  useEffect(() => onPoliciesChange(() => setPolicies(loadPolicies())), []);

  // Reconcile the local cache against the backend (the source of truth) on
  // mount. Backend config wins; the locally-cached folderId (which the backend
  // doesn't track) is preserved. If the backend is unreachable we keep the
  // local cache as-is, so the surface still works offline.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let byCategory;
      try {
        byCategory = await fetchPoliciesByCategory();
      } catch {
        return; // offline / backend down — local cache stands.
      }
      if (cancelled) return;
      const local = loadPolicies();
      const reconciled: PoliciesByCategory = {};
      for (const cat of loadPolicyCatalog().categories) {
        const decoded = byCategory.get(cat.id);
        reconciled[cat.id] = decoded
          ? decodedToState(decoded, local[cat.id]?.folderId)
          : { ...local[cat.id], configured: false, status: "default" };
      }
      for (const [id, state] of Object.entries(reconciled)) {
        updatePolicy(id, state);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Enable a new policy from the wizard result: persist it to the backend (the
   * source of truth), then create the backing folder holding its editable
   * automation, and cache the result locally. Throws (surfacing in the wizard)
   * if the category is unknown or the backend save fails.
   */
  const enablePolicy = useCallback(
    async (id: string, result: PolicyWizardResult) => {
      const category = loadPolicyCatalog().categories.find((c) => c.id === id);
      if (!category) throw new Error(`Unknown policy category: ${id}`);
      const backendId = await persistPolicy(
        toStoreRequest(id, category.label, result, true, undefined),
      );
      const folder = await createPolicyFolderForAutomation(
        category,
        result.automation.id,
      );
      await updatePolicyFolderSettings(folder.id, result.folder);
      updatePolicy(id, {
        configured: true,
        status: "active",
        folderId: folder.id,
        backendId,
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
   * the builder; persist the updated policy to the backend and the folder's
   * output/retry settings + the rest of the settings locally.
   */
  const savePolicyConfig = useCallback(
    async (id: string, result: PolicyWizardResult) => {
      const current = loadPolicies()[id];
      const category = loadPolicyCatalog().categories.find((c) => c.id === id);
      if (!category) throw new Error(`Unknown policy category: ${id}`);
      const backendId = await persistPolicy(
        toStoreRequest(
          id,
          category.label,
          result,
          current?.status !== "paused",
          current?.backendId,
        ),
      );
      if (current?.folderId) {
        await updatePolicyFolderSettings(current.folderId, result.folder);
      }
      updatePolicy(id, {
        backendId,
        fieldValues: result.fieldValues,
        sources: result.sources,
        scopeTypes: result.scopeTypes,
        reviewerEmail: result.reviewerEmail,
      });
    },
    [],
  );

  const pausePolicy = useCallback(async (id: string) => {
    const current = loadPolicies()[id];
    if (current?.backendId) await setPolicyEnabled(current.backendId, false);
    if (current?.folderId) await setPolicyFolderPaused(current.folderId, true);
    updatePolicy(id, { status: "paused" });
  }, []);

  const resumePolicy = useCallback(async (id: string) => {
    const current = loadPolicies()[id];
    if (current?.backendId) await setPolicyEnabled(current.backendId, true);
    if (current?.folderId) await setPolicyFolderPaused(current.folderId, false);
    updatePolicy(id, { status: "active" });
  }, []);

  const deletePolicy = useCallback(async (id: string) => {
    const current = loadPolicies()[id];
    if (current?.backendId) await removePolicy(current.backendId);
    if (current?.folderId) await deletePolicyFolder(current.folderId);
    resetPolicy(id);
  }, []);

  /**
   * Ensure a configured policy has a backing folder (its editable pipeline),
   * creating one from the preset if missing. Returns the folder id.
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

  // Configuration is open to signed-in users; real per-org gating is a backend
  // concern (the mock owner/admin/member permission model has been removed).
  const canConfigure = true;

  return {
    policies,
    canConfigure,
    enablePolicy,
    savePolicyConfig,
    pausePolicy,
    resumePolicy,
    deletePolicy,
    ensurePolicyFolder,
  };
}
