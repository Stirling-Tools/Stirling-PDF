import { Button, Modal } from "@shared/components";
import type { Tier } from "@portal/contexts/TierContext";
import type { PlanOption } from "@portal/api/usage";
import "@portal/views/Usage.css";

interface UpgradeCopy {
  title: string;
  subtitle: string;
  body: string;
  bullets: string[];
  cta: string;
  ctaAccent: "blue" | "purple";
}

/**
 * Modal copy is intent-driven, not just plan-driven: a free user who has hit
 * the cap sees urgency; a pro user is nudged toward a committed plan; an
 * enterprise user is routed to their account team for bespoke terms.
 */
function upgradeCopy(currentTier: Tier, target: PlanOption | null): UpgradeCopy {
  // Cap-reached: free user pushed to pay-as-you-go.
  if (currentTier === "free") {
    return {
      title: "Upgrade to keep processing",
      subtitle: "Pay-as-you-go · $0.05 / doc",
      body: "You're at the edge of the 500 doc/month free cap. Pay-as-you-go lifts the cap instantly — you only pay for what you process beyond the included 25,000 docs.",
      bullets: [
        "Lift the 500 doc/month cap immediately",
        "25,000 docs included, then $0.05/doc",
        "Unlimited pipelines, agents, and sources",
        "Set a monthly spend cap to stay in control",
      ],
      cta: "Switch to pay-as-you-go",
      ctaAccent: "blue",
    };
  }

  // Commit-recommend: pro user with overage nudged to a committed plan.
  if (currentTier === "pro") {
    if (target?.tier === "enterprise") {
      return {
        title: "Move to a committed plan",
        subtitle: "Enterprise · committed annual volume",
        body: "Your overage is consistent month over month. A committed-volume contract lowers your effective per-doc rate and unlocks dedicated regions, SSO, and a named CSM.",
        bullets: [
          "Lower effective rate vs metered overage",
          "Dedicated & on-prem region options",
          "SSO, audit-log export, signed DPA",
          "Named CSM and 99.99% SLA",
        ],
        cta: "Talk to sales",
        ctaAccent: "purple",
      };
    }
    return {
      title: "You're already on pay-as-you-go",
      subtitle: "Considering a committed plan?",
      body: "Pay-as-you-go scales with usage. If your volume is steady, a committed-volume contract typically lowers your effective per-doc rate.",
      bullets: [
        "Predictable monthly spend",
        "Lower effective per-doc rate at volume",
        "Volume discounts kick in past 1M docs/mo",
      ],
      cta: "Explore committed pricing",
      ctaAccent: "purple",
    };
  }

  // Bespoke-enterprise: route to account team.
  return {
    title: "Adjust your commitment",
    subtitle: "Enterprise · bespoke terms",
    body: "Your plan is governed by a committed-volume contract. Changes to committed volume, regions, or terms are handled with your account team — they'll model the right shape with you.",
    bullets: [
      "Re-model committed volume up or down",
      "Add dedicated or on-prem regions",
      "Adjust SLA, DPA, and overage terms",
    ],
    cta: "Contact your CSM",
    ctaAccent: "purple",
  };
}

/** Intent-aware plan-change / sales-conversation modal. */
export function UpgradeModal({
  open,
  onClose,
  currentTier,
  target,
}: {
  open: boolean;
  onClose: () => void;
  currentTier: Tier;
  target: PlanOption | null;
}) {
  const copy = upgradeCopy(currentTier, target);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <div className="portal-usage__modal-actions">
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          {/* TODO(backend): POST /v1/billing/plan-change { tier } (or hand off to
              sales) — for now the CTA just dismisses the modal. */}
          <Button variant="gradient" accent={copy.ctaAccent} onClick={onClose}>
            {copy.cta}
          </Button>
        </div>
      }
    >
      <p className="portal-usage__modal-body">{copy.body}</p>
      <ul className="portal-usage__modal-bullets">
        {copy.bullets.map((b) => (
          <li key={b}>
            <span aria-hidden className="portal-usage__plan-card-check">
              ✓
            </span>
            {b}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
