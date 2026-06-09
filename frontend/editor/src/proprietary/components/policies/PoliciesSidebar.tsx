/**
 * Proprietary implementation of the right-sidebar Policies surface.
 *
 * Shadows the core stubs at {@code core/components/policies/PoliciesSidebar.tsx}
 * via the {@code @app/*} alias cascade. Three slots, all driven by the shared
 * {@link policySelectionStore} so they stay in sync:
 *   • {@link PoliciesSection} — the collapsible policy list, rendered above the
 *     Tools section in {@code RightSidebar} when no policy is open.
 *   • {@link PolicyDetailTakeover} — the detail / wizard / settings view, which
 *     replaces the Tools area when a policy is open.
 *   • {@link PoliciesCollapsedButton} — the icon rail shown when the sidebar is
 *     collapsed; clicking an icon selects the policy and expands the rail.
 */

import { useState, useEffect, useMemo } from "react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { usePolicies } from "@app/hooks/usePolicies";
import { usePolicyCatalog } from "@app/hooks/usePolicyCatalog";
import { getPolicyAutomation } from "@app/services/policyFolders";
import { smartFolderStorage } from "@app/services/smartFolderStorage";
import { runsToActivity, runsToStats } from "@app/services/policyLiveData";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import type { AutomationConfig, AutomationOperation } from "@app/types/automation";
import type { SmartFolder } from "@app/types/smartFolders";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { IconBadge } from "@shared/components/IconBadge";
import {
  deriveRowStatus,
  STATUS_LABEL,
  ROW_ACCENT,
} from "@app/components/policies/policyStatus";
import { StatusBadge } from "@shared/components/StatusBadge";
import { SectionHeader } from "@shared/components/SectionHeader";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import { PolicyDetailPanel } from "@app/components/policies/PolicyDetailPanel";
import { PolicyDeleteConfirmModal } from "@app/components/policies/PolicyDeleteConfirmModal";
import {
  usePolicySelection,
  selectPolicy,
  setPolicyDetailView,
  closePolicy,
} from "@app/components/policies/policySelectionStore";
import "@app/components/policies/Policies.css";

/** Whether the right rail should host the Policies section. True in proprietary. */
export function usePoliciesEnabled(): boolean {
  return POLICIES_ENABLED;
}

/**
 * Whether a policy is open — i.e. its detail view should take over the rail in
 * place of the tool list. False when the feature is off or nothing is selected.
 */
export function usePolicyDetailActive(): boolean {
  const { selectedId } = usePolicySelection();
  return POLICIES_ENABLED && selectedId != null;
}

/** The collapsible policy list, rendered above the Tools section. */
export function PoliciesSection() {
  const pol = usePolicies();
  const { categories } = usePolicyCatalog();
  const [expanded, setExpanded] = useState(true);

  if (!POLICIES_ENABLED) return null;

  // Match the prototype: the header tally counts every CONFIGURED policy
  // (active + paused), not just the active ones.
  const configuredCount = categories.filter(
    (c) => pol.policies[c.id]?.configured,
  ).length;

  return (
    <div className="pol-list">
      <div className="pol-list-head">
        <SectionHeader
          title="Policies"
          count={`${configuredCount} active`}
          collapsible
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
        />
      </div>

      {expanded && (
        <>
          <div className="pol-list-rows">
            {categories.map((cat) => {
              const status = deriveRowStatus(pol.policies[cat.id]);
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="pol-row"
                  onClick={() => selectPolicy(cat.id)}
                >
                  <IconBadge size="sm" accent={ROW_ACCENT[cat.id] ?? "blue"}>
                    {cat.icon}
                  </IconBadge>
                  <span className="pol-row-label">{cat.label}</span>
                  <span className="pol-row-trail">
                    {status === "setup" ? (
                      <span className="pol-row-setup">Set up</span>
                    ) : (
                      <StatusBadge
                        tone={status === "active" ? "success" : "warning"}
                        size="sm"
                      >
                        {STATUS_LABEL[status]}
                      </StatusBadge>
                    )}
                    <ChevronRightIcon
                      className="pol-row-chevron"
                      sx={{ fontSize: "1rem" }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The open-policy view — narrative detail, setup wizard, or edit-settings —
 * which replaces the Tools area while a policy is selected.
 */
export function PolicyDetailTakeover() {
  const pol = usePolicies();
  const { categories, configs, sources, docTypes } = usePolicyCatalog();
  const { selectedId, detailView } = usePolicySelection();

  // The configured policy's backing folder + automation (its real, editable
  // pipeline). `reloadKey` bumps after the edit modal saves so the detail
  // reflects the new steps. Falls back to the preset's rules when unconfigured.
  const folderId = selectedId ? pol.policies[selectedId]?.folderId : undefined;
  const [steps, setSteps] = useState<AutomationOperation[]>([]);
  const [backingFolder, setBackingFolder] = useState<SmartFolder | null>(null);
  const [backingAutomation, setBackingAutomation] =
    useState<AutomationConfig | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!folderId) {
      setSteps([]);
      setBackingFolder(null);
      setBackingAutomation(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [folder, automation] = await Promise.all([
        smartFolderStorage.getFolder(folderId),
        getPolicyAutomation(folderId),
      ]);
      if (cancelled) return;
      setBackingFolder(folder);
      setBackingAutomation(automation);
      setSteps(automation?.operations ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [folderId, reloadKey]);

  // Activity/stats come from the real backend runs the auto-run controller fires
  // on every upload (policyRunStore), filtered to this policy's category. The
  // store is reactive, so the feed updates live as runs progress — no polling
  // here (the controller does the run-status polling).
  const allRuns = usePolicyRuns();
  const categoryRuns = useMemo(
    () => allRuns.filter((r) => r.categoryId === selectedId),
    [allRuns, selectedId],
  );

  if (!POLICIES_ENABLED || selectedId == null) return null;

  const category = categories.find((c) => c.id === selectedId);
  const state = pol.policies[selectedId];
  const config = configs[selectedId];
  if (!category || !state || !config) return null;

  const status = deriveRowStatus(state);

  const onSetupClassification = () => {
    const classifier = categories.find((c) => c.providesClassification);
    if (classifier) selectPolicy(classifier.id);
  };

  // Setup: the shared wizard in create mode (workflow → settings → sources →
  // review). The workflow step embeds the builder, so the wizard is only
  // rendered here, not in the rail tests (which mock it).
  if (!state.configured) {
    return (
      <PolicySetupWizard
        key={selectedId}
        category={category}
        config={config}
        initial={state}
        sources={sources}
        docTypes={docTypes}
        canConfigure={pol.canConfigure}
        // The prototype always offers "Set up Classification" in step 2 — there
        // is no standalone classification policy that would flip this on.
        classificationEnabled={false}
        mode="create"
        onCancel={() => closePolicy()}
        onComplete={(result) =>
          pol
            .enablePolicy(selectedId, result)
            .then(() => setPolicyDetailView("detail"))
        }
        onSetupClassification={onSetupClassification}
      />
    );
  }

  // Edit: the same wizard in edit mode, pre-filled — so editing has the settings
  // steps (not just the workflow). Wait for the backing automation to load so
  // the workflow step edits the real pipeline.
  if (detailView === "settings" && pol.canConfigure) {
    if (!backingAutomation) {
      return (
        <div className="pol-detail">
          <div className="pol-scroll">
            <p className="pol-desc">Loading…</p>
          </div>
        </div>
      );
    }
    return (
      <PolicySetupWizard
        key={`edit-${selectedId}`}
        category={category}
        config={config}
        initial={state}
        sources={sources}
        docTypes={docTypes}
        canConfigure={pol.canConfigure}
        classificationEnabled={false}
        mode="edit"
        existingAutomation={backingAutomation}
        initialFolder={backingFolder ?? undefined}
        onCancel={() => setPolicyDetailView("detail")}
        onComplete={(result) =>
          pol.savePolicyConfig(selectedId, result).then(() => {
            setReloadKey((k) => k + 1);
            setPolicyDetailView("detail");
          })
        }
        onSetupClassification={onSetupClassification}
      />
    );
  }

  return (
    <>
      <PolicyDetailPanel
        category={category}
        config={config}
        status={status}
        steps={steps}
        activity={runsToActivity(categoryRuns)}
        stats={runsToStats(categoryRuns, backingFolder?.createdAt)}
        canConfigure={pol.canConfigure}
        onBack={() => closePolicy()}
        onEditSettings={() => {
          // Seeded/active policies may have no backing folder yet — create one
          // from the preset so there's a workflow to edit, then open settings.
          void pol
            .ensurePolicyFolder(selectedId)
            .then(() => setPolicyDetailView("settings"));
        }}
        onTogglePause={() =>
          status === "paused"
            ? pol.resumePolicy(selectedId)
            : pol.pausePolicy(selectedId)
        }
        onDelete={() => setConfirmingDelete(true)}
      />
      {confirmingDelete && (
        <PolicyDeleteConfirmModal
          opened
          label={category.label}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            closePolicy();
            void pol.deletePolicy(selectedId);
          }}
        />
      )}
    </>
  );
}

/**
 * Collapsed-rail policy icons. Each tints blue when active and carries a small
 * status dot (green active / amber paused). Clicking selects the policy and
 * expands the rail.
 */
export function PoliciesCollapsedButton({
  onExpand,
}: {
  onExpand: () => void;
}) {
  const pol = usePolicies();
  const { categories } = usePolicyCatalog();

  if (!POLICIES_ENABLED) return null;

  return (
    <>
      <div className="pol-crail">
        {categories.map((cat) => {
          const status = deriveRowStatus(pol.policies[cat.id]);
          const suffix =
            status === "active"
              ? " (Active)"
              : status === "paused"
                ? " (Paused)"
                : "";
          return (
            <AppTooltip
              key={cat.id}
              content={`${cat.label}${suffix}`}
              position="left"
              arrow
              delay={300}
            >
              <button
                type="button"
                className="pol-crail-btn"
                data-status={status}
                aria-label={`${cat.label} policy — ${STATUS_LABEL[status]}`}
                onClick={() => {
                  selectPolicy(cat.id);
                  onExpand();
                }}
              >
                {cat.icon}
                {(status === "active" || status === "paused") && (
                  <span className="pol-crail-dot" data-status={status} />
                )}
              </button>
            </AppTooltip>
          );
        })}
      </div>
      <div className="tool-panel__collapsed-divider" />
    </>
  );
}
