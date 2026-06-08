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

import { useState, useEffect } from "react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { usePolicies } from "@app/hooks/usePolicies";
import { usePolicyCatalog } from "@app/hooks/usePolicyCatalog";
import { getPolicyAutomation } from "@app/services/policyFolders";
import { smartFolderStorage } from "@app/services/smartFolderStorage";
import {
  getPolicyLiveData,
  type PolicyLiveData,
} from "@app/services/policyLiveData";
import type { AutomationConfig, AutomationOperation } from "@app/types/automation";
import type { SmartFolder } from "@app/types/smartFolders";
import { SmartFolderManagementModal } from "@app/components/smartFolders/SmartFolderManagementModal";
import { ToggleSwitch } from "@shared/components/ToggleSwitch";
import {
  usePolicyDataMode,
  setPolicyDataMode,
} from "@app/components/policies/policyDataModeStore";
import type { PolicyRowStatus, PolicyState } from "@app/types/policies";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { Banner } from "@shared/components/Banner";
import { NavItem } from "@shared/components/NavItem";
import { StatusBadge } from "@shared/components/StatusBadge";
import { SectionHeader } from "@shared/components/SectionHeader";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import { PolicyDetailPanel } from "@app/components/policies/PolicyDetailPanel";
import {
  usePolicySelection,
  selectPolicy,
  setPolicyDetailView,
  closePolicy,
} from "@app/components/policies/policySelectionStore";
import "@app/components/policies/Policies.css";

/** Derive a single row/detail status, treating a spend-limit hit as paused. */
function deriveRowStatus(
  state: PolicyState | undefined,
  spendReached: boolean,
): PolicyRowStatus {
  if (!state?.configured) return "setup";
  if (spendReached || state.status === "paused") return "paused";
  return "active";
}

const STATUS_LABEL: Record<PolicyRowStatus, string> = {
  active: "Active",
  paused: "Paused",
  setup: "Set up",
};

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
  const dataMode = usePolicyDataMode();
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
        {expanded && (
          <div className="pol-data-toggle">
            <span className="pol-data-toggle__label">
              {dataMode === "live" ? "Live data" : "Demo data"}
            </span>
            <ToggleSwitch
              size="sm"
              checked={dataMode === "live"}
              onChange={(checked) =>
                setPolicyDataMode(checked ? "live" : "mock")
              }
              aria-label="Toggle live data"
            />
          </div>
        )}
      </div>

      {expanded && (
        <>
          {pol.spendLimitWarning && (
            <div className="pol-spend-wrap">
              <Banner
                tone={pol.spendLimitReached ? "danger" : "warning"}
                description={
                  pol.spendLimitReached
                    ? "Policies paused — spend limit reached."
                    : `$${pol.spendLimit.used.toFixed(2)} / $${pol.spendLimit.limit} limit`
                }
              />
            </div>
          )}

          <div className="pol-list-rows">
            {categories.map((cat) => {
              const status = deriveRowStatus(
                pol.policies[cat.id],
                pol.spendLimitReached,
              );
              return (
                <NavItem
                  key={cat.id}
                  id={cat.id}
                  icon={cat.icon}
                  label={cat.label}
                  trailing={
                    <>
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
                    </>
                  }
                  onClick={selectPolicy}
                />
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
  const { selectedId } = usePolicySelection();
  const dataMode = usePolicyDataMode();

  // The configured policy's backing folder + automation (its real, editable
  // pipeline). `reloadKey` bumps after the edit modal saves so the detail
  // reflects the new steps. Falls back to the preset's rules when unconfigured.
  const folderId = selectedId ? pol.policies[selectedId]?.folderId : undefined;
  const [steps, setSteps] = useState<AutomationOperation[]>([]);
  const [backingFolder, setBackingFolder] = useState<SmartFolder | null>(null);
  const [backingAutomation, setBackingAutomation] =
    useState<AutomationConfig | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
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

  // Live activity/stats from the backing folder's run state, when the data-mode
  // toggle is "live"; otherwise the panel uses the preset's mock data.
  const [liveData, setLiveData] = useState<PolicyLiveData | null>(null);
  useEffect(() => {
    if (dataMode !== "live" || !folderId) {
      setLiveData(null);
      return;
    }
    let cancelled = false;
    getPolicyLiveData(folderId).then((d) => {
      if (!cancelled) setLiveData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [dataMode, folderId]);

  if (!POLICIES_ENABLED || selectedId == null) return null;

  const category = categories.find((c) => c.id === selectedId);
  const state = pol.policies[selectedId];
  const config = configs[selectedId];
  if (!category || !state || !config) return null;

  const status = deriveRowStatus(state, pol.spendLimitReached);

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
        onCancel={() => closePolicy()}
        onEnable={() => {
          void pol
            .enablePolicy(selectedId)
            .then(() => setPolicyDetailView("detail"));
        }}
        onSetupClassification={() => {
          const classifier = categories.find((c) => c.providesClassification);
          if (classifier) selectPolicy(classifier.id);
        }}
      />
    );
  }

  return (
    <>
      <PolicyDetailPanel
        category={category}
        config={config}
        state={state}
        status={status}
        steps={steps}
        activity={liveData?.activity}
        stats={liveData?.stats}
        canConfigure={pol.canConfigure}
        onBack={() => closePolicy()}
        onEditSettings={() => setEditing(true)}
        onTogglePause={() =>
          status === "paused"
            ? pol.resumePolicy(selectedId)
            : pol.pausePolicy(selectedId)
        }
        onDelete={() => {
          closePolicy();
          pol.deletePolicy(selectedId);
        }}
      />
      {/* Edit the policy's pipeline by reusing the Watch Folder builder on its
          backing folder/automation (rendered only while open, so its
          useToolWorkflow dependency never runs in the rail tests). */}
      {editing && backingFolder && (
        <SmartFolderManagementModal
          opened
          editFolder={backingFolder}
          existingAutomation={backingAutomation}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setReloadKey((k) => k + 1);
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
          const status = deriveRowStatus(
            pol.policies[cat.id],
            pol.spendLimitReached,
          );
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
