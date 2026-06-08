/**
 * DEV-ONLY preview route for the new PAYG plan + upgrade flow UI. NOT shipped
 * to production — gated by {@code import.meta.env.DEV} in {@code App.tsx}.
 *
 * Purpose: lets me iterate on the visual design of PaygFreeLeader,
 * PaygFreeMember, and the upgrade modal without going through auth + the
 * config-modal nav. Each preview slot just renders one component with mock
 * data; the slot toggle at the top is the only chrome.
 *
 * Delete this file (and its route registration in App.tsx) before the bundle
 * PR is marked ready-for-review.
 */
import React, { useState } from "react";
import {
  PaygLeader,
  PaygMember,
} from "@app/components/shared/config/configSections/Payg";
import {
  PaygFreeLeader,
  PaygFreeMember,
} from "@app/components/shared/config/configSections/PaygFree";

type PreviewSlot =
  | "free-leader"
  | "free-member"
  | "subscribed-leader"
  | "subscribed-member";

const SLOT_LABELS: Record<PreviewSlot, string> = {
  "free-leader": "Free · LEADER",
  "free-member": "Free · MEMBER",
  "subscribed-leader": "Subscribed · LEADER",
  "subscribed-member": "Subscribed · MEMBER",
};

export default function DevPaygPreview() {
  const [slot, setSlot] = useState<PreviewSlot>("free-leader");

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
              padding: "6px 14px",
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
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px" }}>
        {slot === "free-leader" && <PaygFreeLeader />}
        {slot === "free-member" && <PaygFreeMember />}
        {slot === "subscribed-leader" && <PaygLeader />}
        {slot === "subscribed-member" && <PaygMember />}
      </main>
    </div>
  );
}
