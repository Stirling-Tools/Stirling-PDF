import { useState } from "react";
import ShieldIcon from "@mui/icons-material/Shield";
import { POLICY_CATEGORIES, POLICY_CONFIG } from "@app/data/policyDefinitions";
import { usePolicies } from "@app/hooks/usePolicies";
import type { PolicyDetailView } from "@app/types/policies";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import { PolicyDetailPanel } from "@app/components/policies/PolicyDetailPanel";
import { PolicySettingsForm } from "@app/components/policies/PolicySettingsForm";
import { PolicyBillingBar } from "@app/components/policies/PolicyBillingBar";
import "@app/components/policies/Policies.css";

/**
 * The Policies surface: a category rail (with live status + billing) beside a
 * detail pane that routes to the setup wizard (unconfigured), the narrative
 * view (configured), or the settings form. Mirrors the prototype's right-rail
 * design, mounted here as a workbench view.
 */
export function PoliciesPanel(_props: { data?: unknown }) {
  const pol = usePolicies();
  const [selectedId, setSelectedId] = useState<string | null>(
    POLICY_CATEGORIES[0]?.id ?? null,
  );
  const [detailView, setDetailView] = useState<PolicyDetailView>("detail");

  const select = (id: string | null) => {
    setSelectedId(id);
    setDetailView("detail");
  };

  const ingestion = pol.policies["ingestion"];
  const classificationEnabled = Boolean(
    ingestion?.configured && ingestion?.status === "active",
  );

  const category = POLICY_CATEGORIES.find((c) => c.id === selectedId) ?? null;
  const state = selectedId ? pol.policies[selectedId] : null;
  const config = selectedId ? POLICY_CONFIG[selectedId] : null;
  const isPaused = Boolean(
    state && (pol.spendLimitReached || state.status === "paused"),
  );

  const renderPane = () => {
    if (!category || !state || !config || !selectedId) {
      return (
        <div className="pol-pane-empty">
          <ShieldIcon
            sx={{ fontSize: "2rem", color: "var(--text-muted)", opacity: 0.4 }}
          />
          <p className="pol-empty-title">Select a policy</p>
          <p className="pol-empty-sub">
            Choose a policy to configure how documents are enforced.
          </p>
        </div>
      );
    }

    if (!state.configured) {
      return (
        <PolicySetupWizard
          category={category}
          config={config}
          initial={state}
          canConfigure={pol.canConfigure}
          classificationEnabled={classificationEnabled}
          onCancel={() => select(null)}
          onEnable={(input) => {
            pol.enablePolicy(selectedId, input);
            setDetailView("detail");
          }}
          onSetupClassification={() => select("ingestion")}
        />
      );
    }

    if (detailView === "settings" && pol.canConfigure) {
      return (
        <PolicySettingsForm
          config={config}
          state={state}
          onCancel={() => setDetailView("detail")}
          onSave={(fv) => {
            pol.updateConfig(selectedId, fv);
            setDetailView("detail");
          }}
        />
      );
    }

    return (
      <PolicyDetailPanel
        category={category}
        config={config}
        state={state}
        canConfigure={pol.canConfigure}
        isPaused={isPaused}
        onBack={() => select(null)}
        onClose={() => select(null)}
        onEditSettings={() => setDetailView("settings")}
        onTogglePause={() =>
          state.status === "paused"
            ? pol.resumePolicy(selectedId)
            : pol.pausePolicy(selectedId)
        }
        onDelete={() => pol.deletePolicy(selectedId)}
      />
    );
  };

  return (
    <div className="pol-panel">
      <div className="pol-rail">
        <div className="pol-rail-head">Policies</div>
        <div className="pol-rail-list">
          {POLICY_CATEGORIES.map((cat) => {
            const st = pol.policies[cat.id];
            const status =
              st?.status === "active"
                ? "active"
                : st?.status === "paused"
                  ? "paused"
                  : st?.configured
                    ? "configured"
                    : "default";
            return (
              <button
                key={cat.id}
                type="button"
                className={`pol-rail-item${selectedId === cat.id ? " is-sel" : ""}`}
                onClick={() => select(cat.id)}
              >
                <span className="pol-rail-icon">{cat.icon}</span>
                <span className="pol-rail-label">{cat.label}</span>
                <span className="pol-rail-status" data-status={status} />
              </button>
            );
          })}
        </div>
        <PolicyBillingBar
          activePolicyCount={pol.activePolicyCount}
          perDocCost={pol.perDocCost}
          tier={pol.billing.tier}
          spendLimit={pol.spendLimit}
          setSpendLimit={pol.setSpendLimit}
          spendLimitReached={pol.spendLimitReached}
          spendLimitWarning={pol.spendLimitWarning}
        />
      </div>
      <div className="pol-pane">{renderPane()}</div>
    </div>
  );
}
