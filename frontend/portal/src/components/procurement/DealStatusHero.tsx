import { useTranslation } from "react-i18next";
import { Button } from "@shared/components";
import { JOURNEY, type ProcurementSnapshot } from "@portal/api/procurement";
import { StageStepper } from "@portal/components/procurement/StageStepper";
import "@portal/views/Procurement.css";

/**
 * The enterprise deal-status hero, shown on Home once a procurement is active (copying the
 * prototype: procurement lives on Home, not as a nav tab). Compact banner — eyebrow, company,
 * trial countdown, the stage stepper, and an adaptive next-step CTA that expands the flow into the
 * full-screen takeover modal.
 */
export function DealStatusHero({
  snapshot,
  onExpand,
}: {
  snapshot: ProcurementSnapshot;
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const stage = snapshot.stage ?? "trial";
  const cta =
    stage === "trial"
      ? t("procurement.hero.ctaTrial")
      : stage === "quote"
        ? t("procurement.hero.ctaQuote")
        : stage === "procurement"
          ? t("procurement.hero.ctaPayment")
          : t("procurement.hero.ctaLive");

  return (
    <div className="portal-hero">
      <div className="portal-hero__top">
        <div>
          <span className="portal-hero__eyebrow">
            {t("procurement.hero.eyebrow")}
          </span>
          <span className="portal-hero__company">
            {t("procurement.hero.company")}
          </span>
        </div>
        <div className="portal-hero__chips">
          {stage === "trial" && snapshot.trialEndsAt && (
            <span className="portal-hero__chip">
              {t("procurement.journey.daysLeft", {
                count: daysLeft(snapshot.trialEndsAt),
              })}
            </span>
          )}
          <span className="portal-hero__chip">
            {t("procurement.hero.keyDocs")}
          </span>
        </div>
      </div>

      <div className="portal-hero__stepper">
        <StageStepper journey={JOURNEY} currentStage={stage} />
      </div>

      <div className="portal-hero__next">
        <span className="portal-hero__next-label">
          <span className="portal-hero__next-dot" />
          {t("procurement.hero.nextStep", { action: cta })}
        </span>
        <Button variant="gradient" accent="purple" onClick={onExpand}>
          {stage === "active" ? t("procurement.hero.open") : cta}
        </Button>
      </div>
    </div>
  );
}

function daysLeft(iso: string): number {
  const end = new Date(iso).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
