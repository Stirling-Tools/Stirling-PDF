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

import { useState } from "react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { POLICY_CATEGORIES, POLICY_CONFIG } from "@app/data/policyDefinitions";
import { usePolicies } from "@app/hooks/usePolicies";
import type { PolicyRowStatus, PolicyState } from "@app/types/policies";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import { PolicyDetailPanel } from "@app/components/policies/PolicyDetailPanel";
import { PolicySettingsForm } from "@app/components/policies/PolicySettingsForm";
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
  const [expanded, setExpanded] = useState(true);

  if (!POLICIES_ENABLED) return null;

  // Match the prototype: the header tally counts every CONFIGURED policy
  // (active + paused), not just the active ones.
  const configuredCount = POLICY_CATEGORIES.filter(
    (c) => pol.policies[c.id]?.configured,
  ).length;

  return (
    <div className="pol-list">
      <button
        type="button"
        className="pol-list-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="pol-list-head-label">Policies</span>
        <span className="pol-list-head-count">{configuredCount} active</span>
        <ExpandMoreIcon
          className="pol-list-head-chevron"
          data-collapsed={!expanded}
          sx={{ fontSize: "1.1rem" }}
        />
      </button>

      {expanded && (
        <>
          {pol.spendLimitWarning && (
            <div
              className={`pol-spend-chip${pol.spendLimitReached ? " is-reached" : ""}`}
            >
              {pol.spendLimitReached
                ? "Policies paused — spend limit reached."
                : `$${pol.spendLimit.used.toFixed(2)} / $${pol.spendLimit.limit} limit`}
            </div>
          )}

          <div className="pol-list-rows">
            {POLICY_CATEGORIES.map((cat) => {
              const status = deriveRowStatus(
                pol.policies[cat.id],
                pol.spendLimitReached,
              );
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="pol-row"
                  data-status={status}
                  onClick={() => selectPolicy(cat.id)}
                  aria-label={`${cat.label} policy — ${STATUS_LABEL[status]}`}
                >
                  <span className="pol-row-accent" />
                  <span className="pol-row-icon">{cat.icon}</span>
                  <span className="pol-row-label">{cat.label}</span>
                  <span className="pol-row-status">{STATUS_LABEL[status]}</span>
                  <ChevronRightIcon
                    className="pol-row-chevron"
                    sx={{ fontSize: "1rem" }}
                  />
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
  const { selectedId, detailView } = usePolicySelection();

  if (!POLICIES_ENABLED || selectedId == null) return null;

  const category = POLICY_CATEGORIES.find((c) => c.id === selectedId);
  const state = pol.policies[selectedId];
  const config = POLICY_CONFIG[selectedId];
  if (!category || !state || !config) return null;

  const status = deriveRowStatus(state, pol.spendLimitReached);

  if (!state.configured) {
    return (
      <PolicySetupWizard
        key={selectedId}
        category={category}
        config={config}
        initial={state}
        canConfigure={pol.canConfigure}
        // The prototype always offers "Set up Classification" in step 2 — there
        // is no standalone classification policy that would flip this on.
        classificationEnabled={false}
        onCancel={() => closePolicy()}
        onEnable={(input) => {
          pol.enablePolicy(selectedId, input);
          setPolicyDetailView("detail");
        }}
        onSetupClassification={() => selectPolicy("ingestion")}
      />
    );
  }

  if (detailView === "settings" && pol.canConfigure) {
    return (
      <PolicySettingsForm
        key={selectedId}
        category={category}
        config={config}
        state={state}
        status={status}
        onCancel={() => setPolicyDetailView("detail")}
        onSave={(fv) => {
          pol.updateConfig(selectedId, fv);
          setPolicyDetailView("detail");
        }}
      />
    );
  }

  return (
    <PolicyDetailPanel
      category={category}
      config={config}
      state={state}
      status={status}
      canConfigure={pol.canConfigure}
      onBack={() => closePolicy()}
      onEditSettings={() => setPolicyDetailView("settings")}
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

  if (!POLICIES_ENABLED) return null;

  return (
    <>
      <div className="tool-panel__collapsed-divider" />
      <div className="pol-crail">
        {POLICY_CATEGORIES.map((cat) => {
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
    </>
  );
}
