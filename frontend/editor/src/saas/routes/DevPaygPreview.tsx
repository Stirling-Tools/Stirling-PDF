/**
 * DEV-ONLY preview route for the new PAYG plan + upgrade flow UI. NOT shipped
 * to production — gated by {@code import.meta.env.DEV} in {@code App.tsx}.
 *
 * Purpose: lets me iterate on the visual design of EditorPlanPromo +
 * UpgradeModal + the wired-up Payg dashboard without going through auth + the
 * config-modal nav. Each preview slot just renders one of the new components
 * with mock data and a state toggle.
 *
 * Delete this file (and its route registration in App.tsx) before the bundle
 * PR is marked ready-for-review.
 */
import React, { useState } from "react";
import EditorPlanPromo from "@app/components/shared/config/configSections/EditorPlanPromo";
import UpgradeModal from "@app/components/shared/config/configSections/UpgradeModal";
import { PaygLeader, PaygMember } from "@app/components/shared/config/configSections/Payg";

type PreviewSlot = "free" | "upgrade-modal" | "active-leader" | "active-member";

const SLOT_LABELS: Record<PreviewSlot, string> = {
  free: "Free user — Editor plan promo",
  "upgrade-modal": "Upgrade modal (cap → Stripe)",
  "active-leader": "Subscribed — LEADER dashboard",
  "active-member": "Subscribed — MEMBER dashboard",
};

export default function DevPaygPreview() {
  const [slot, setSlot] = useState<PreviewSlot>("free");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-default, #fafafa)",
        color: "var(--text-primary, #111)",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <header
        style={{
          padding: "12px 24px",
          background: "rgba(0, 0, 0, 0.04)",
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 13,
        }}
      >
        <strong style={{ marginRight: 8 }}>DEV PREVIEW</strong>
        {(Object.keys(SLOT_LABELS) as PreviewSlot[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d8dce1",
              background: slot === s ? "#2563eb" : "white",
              color: slot === s ? "white" : "#111",
              fontWeight: slot === s ? 600 : 400,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {SLOT_LABELS[s]}
          </button>
        ))}
        <span style={{ marginLeft: "auto", color: "#666", fontSize: 11 }}>
          Not shipped to production. Removed before PR merge.
        </span>
      </header>
      <main
        style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}
      >
        {slot === "free" && (
          <EditorPlanPromo onUpgradeClick={() => setUpgradeOpen(true)} />
        )}
        {slot === "upgrade-modal" && (
          <div>
            <p style={{ color: "#666", marginBottom: 16 }}>
              The modal opens over whatever is behind it. Click below to
              re-open if you've closed it.
            </p>
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              style={{
                padding: "10px 18px",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Open upgrade modal
            </button>
          </div>
        )}
        {slot === "active-leader" && <PaygLeader />}
        {slot === "active-member" && <PaygMember />}
      </main>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        onComplete={({ capUsd }) => {
          setUpgradeOpen(false);
          // eslint-disable-next-line no-alert
          alert(
            `Demo: subscription complete. Cap = ${
              capUsd === null ? "no cap" : `$${capUsd}/mo`
            }. Real flow would refresh the wallet snapshot here.`,
          );
        }}
      />
    </div>
  );
}
