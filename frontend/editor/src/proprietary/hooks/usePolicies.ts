/**
 * State + actions for Policies. The backend (`/api/v1/policies`) is the source
 * of truth: on mount we reconcile the local cache against the stored policies,
 * and every lifecycle action (enable/save/pause/resume/delete) is mirrored to
 * the backend. localStorage is a fast-render cache + offline fallback; the
 * IndexedDB backing folder still holds the editable automation + run state.
 */

import { useState, useEffect, useCallback } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
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
  getPolicyAutomation,
  setPolicyFolderPaused,
  updatePolicyFolderSettings,
  updatePolicyOperations,
} from "@app/services/policyFolders";
import {
  fetchPoliciesByCategory,
  decodedToState,
  findBackendId,
  persistPolicy,
  setPolicyEnabled,
  removePolicy,
} from "@app/services/policyBackend";
import type { PolicyToStore } from "@app/services/policyPipeline";
import type {
  PoliciesByCategory,
  PolicyConfigResult,
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
  const { config } = useAppConfig();
  const { isTeamLeader } = useSaaSTeam();

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
      // One policy per category, ever: reuse any existing backend record.
      const existingBackendId =
        loadPolicies()[id]?.backendId ??
        (await findBackendId(id).catch(() => undefined));
      const backendId = await persistPolicy(
        toStoreRequest(id, category.label, result, true, existingBackendId),
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
        outputMode: result.folder.outputMode,
        outputName: result.folder.outputName,
        runOn: result.folder.runOn,
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
        outputMode: result.folder.outputMode,
        outputName: result.folder.outputName,
        runOn: result.folder.runOn,
      });
    },
    [],
  );

  /**
   * Create-or-update a policy from the locked tool-config page. Unlike the
   * wizard path this works straight from the tool `operations` (the config page
   * owns the chain): it creates the backing folder + automation on first
   * configure, or updates the existing automation's operations on edit, then
   * mirrors the whole policy to the backend. One method serves both because a
   * preset policy has no separate "create" — you're just configuring it.
   */
  const commitPolicyConfig = useCallback(
    async (id: string, result: PolicyConfigResult) => {
      const category = loadPolicyCatalog().categories.find((c) => c.id === id);
      if (!category) throw new Error(`Unknown policy category: ${id}`);
      const current = loadPolicies()[id];
      // One policy per category, ever: reuse the existing backend record (even
      // if the local link was lost) so a save never creates a duplicate.
      const existingBackendId =
        current?.backendId ?? (await findBackendId(id).catch(() => undefined));
      let folderId = current?.folderId;
      if (folderId) {
        await updatePolicyOperations(folderId, result.operations);
      } else {
        const folder = await createPolicyFolder(category, result.operations);
        folderId = folder.id;
      }
      await updatePolicyFolderSettings(folderId, result.folder);
      // The saved automation (with its id) is the lossless round-trip blob.
      const automation = await getPolicyAutomation(folderId);
      const store: PolicyToStore = {
        id: existingBackendId,
        categoryId: id,
        name: `${category.label} Policy`,
        enabled: current?.status !== "paused",
        automation: automation ?? {
          id: "",
          name: `${category.label} Policy`,
          operations: result.operations,
          createdAt: "",
          updatedAt: "",
        },
        pipelineSteps: result.pipelineSteps,
        sources: result.sources,
        scopeTypes: result.scopeTypes,
        reviewerEmail: result.reviewerEmail,
        fieldValues: result.fieldValues,
        folder: result.folder,
      };
      const backendId = await persistPolicy(store);
      updatePolicy(id, {
        configured: true,
        status: current?.status === "paused" ? "paused" : "active",
        folderId,
        backendId,
        fieldValues: result.fieldValues,
        sources: result.sources,
        scopeTypes: result.scopeTypes,
        reviewerEmail: result.reviewerEmail,
        outputMode: result.folder.outputMode,
        outputName: result.folder.outputName,
        runOn: result.folder.runOn,
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
   * Ensure a configured policy has a *valid* backing folder (its editable
   * pipeline) and return its id. Self-heals a stale `folderId` — one that no
   * longer resolves to a real folder (cleared storage, or a folder left in an
   * old IndexedDB after a rename/migration) — which would otherwise hang the
   * Edit-Settings view on a permanent "Loading…". When recreating, the backend's
   * stored automation is used if present so the configured pipeline survives;
   * otherwise it falls back to the preset.
   */
  const ensurePolicyFolder = useCallback(async (id: string) => {
    const state = loadPolicies()[id];
    const existing = state?.folderId;
    // A healthy backing folder resolves to an automation; if it does, keep it.
    if (existing && (await getPolicyAutomation(existing))) return existing;
    const catalog = loadPolicyCatalog();
    const category = catalog.categories.find((c) => c.id === id);
    const config = catalog.configs[id];
    if (!category || !config) return undefined;
    // Stale/missing folder → recreate. Prefer the backend's stored automation
    // (preserves the user's configured steps); else seed from the preset.
    let operations = config.defaultOperations;
    if (state?.backendId) {
      const decoded = await fetchPoliciesByCategory()
        .then((m) => m.get(id))
        .catch(() => undefined);
      if (decoded?.automation?.operations?.length) {
        operations = decoded.automation.operations;
      }
    }
    const folder = await createPolicyFolder(category, operations);
    updatePolicy(id, { folderId: folder.id });
    return folder.id;
  }, []);

  // Only a team leader (SaaS) or a global admin (self-hosted) may configure;
  // everyone else gets the read-only surface. Login disabled (single-user)
  // always can. Stays closed until config loads, so edit controls never flash
  // for users who can't use them.
  const canConfigure =
    config != null &&
    (!config.enableLogin || isTeamLeader || config.isAdmin === true);

  return {
    policies,
    canConfigure,
    enablePolicy,
    savePolicyConfig,
    commitPolicyConfig,
    pausePolicy,
    resumePolicy,
    deletePolicy,
    ensurePolicyFolder,
  };
}
