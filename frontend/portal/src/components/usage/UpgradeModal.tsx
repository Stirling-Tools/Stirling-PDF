import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
function upgradeCopy(
  t: TFunction,
  currentTier: Tier,
  target: PlanOption | null,
): UpgradeCopy {
  // Cap-reached: free user pushed to pay-as-you-go.
  if (currentTier === "free") {
    return {
      title: t("usage.upgrade.free.title"),
      subtitle: t("usage.upgrade.free.subtitle"),
      body: t("usage.upgrade.free.body"),
      bullets: [
        t("usage.upgrade.free.bullets.0"),
        t("usage.upgrade.free.bullets.1"),
        t("usage.upgrade.free.bullets.2"),
        t("usage.upgrade.free.bullets.3"),
      ],
      cta: t("usage.upgrade.free.cta"),
      ctaAccent: "blue",
    };
  }

  // Commit-recommend: pro user with overage nudged to a committed plan.
  if (currentTier === "pro") {
    if (target?.tier === "enterprise") {
      return {
        title: t("usage.upgrade.proToEnterprise.title"),
        subtitle: t("usage.upgrade.proToEnterprise.subtitle"),
        body: t("usage.upgrade.proToEnterprise.body"),
        bullets: [
          t("usage.upgrade.proToEnterprise.bullets.0"),
          t("usage.upgrade.proToEnterprise.bullets.1"),
          t("usage.upgrade.proToEnterprise.bullets.2"),
          t("usage.upgrade.proToEnterprise.bullets.3"),
        ],
        cta: t("usage.upgrade.proToEnterprise.cta"),
        ctaAccent: "purple",
      };
    }
    return {
      title: t("usage.upgrade.pro.title"),
      subtitle: t("usage.upgrade.pro.subtitle"),
      body: t("usage.upgrade.pro.body"),
      bullets: [
        t("usage.upgrade.pro.bullets.0"),
        t("usage.upgrade.pro.bullets.1"),
        t("usage.upgrade.pro.bullets.2"),
      ],
      cta: t("usage.upgrade.pro.cta"),
      ctaAccent: "purple",
    };
  }

  // Bespoke-enterprise: route to account team.
  return {
    title: t("usage.upgrade.enterprise.title"),
    subtitle: t("usage.upgrade.enterprise.subtitle"),
    body: t("usage.upgrade.enterprise.body"),
    bullets: [
      t("usage.upgrade.enterprise.bullets.0"),
      t("usage.upgrade.enterprise.bullets.1"),
      t("usage.upgrade.enterprise.bullets.2"),
    ],
    cta: t("usage.upgrade.enterprise.cta"),
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
  const { t } = useTranslation();
  const copy = upgradeCopy(t, currentTier, target);
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
            {t("usage.upgrade.notNow")}
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
