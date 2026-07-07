import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import type { ViewId } from "@portal/contexts/ViewContext";
import { JOURNEY, type ProcurementSnapshot } from "@portal/api/procurement";
import { StageStepper } from "@portal/components/procurement/StageStepper";
import "@portal/views/Procurement.css";

/**
 * The enterprise deal-status hero on Home (procurement lives here, not as a nav tab). Adapts to the
 * deal stage: quick-action chips (trial countdown → manage, key documents, invite teammates,
 * schedule a call), a rollout checklist during the trial, and a stage-specific primary CTA that
 * expands the flow into the takeover modal. Matches the marketing prototype.
 */
export function DealStatusHero({
  snapshot,
  busy = false,
  onExpand,
  onKeyDocs,
  onInvite,
  onSchedule,
  onManageTrial,
  onNavigate,
}: {
  snapshot: ProcurementSnapshot;
  busy?: boolean;
  onExpand: () => void;
  onKeyDocs: () => void;
  onInvite: () => void;
  onSchedule: () => void;
  onManageTrial: () => void;
  onNavigate: (view: ViewId) => void;
}) {
  const { t } = useTranslation();
  const stage = snapshot.stage ?? "trial";
  const inTrial = stage === "trial";
  const cta =
    stage === "trial"
      ? t("portal.procurement.hero.ctaTrial")
      : stage === "quote"
        ? t("portal.procurement.hero.ctaQuote")
        : stage === "security"
          ? t("portal.procurement.hero.ctaAgreement")
          : stage === "procurement"
            ? t("portal.procurement.hero.ctaPayment")
            : t("portal.procurement.hero.ctaLive");

  const setupSteps: { title: string; sub: string; view: ViewId }[] = [
    {
      title: t("portal.procurement.hero.setup1Title"),
      sub: t("portal.procurement.hero.setup1Sub"),
      view: "users",
    },
    {
      title: t("portal.procurement.hero.setup2Title"),
      sub: t("portal.procurement.hero.setup2Sub"),
      view: "sources",
    },
    {
      title: t("portal.procurement.hero.setup3Title"),
      sub: t("portal.procurement.hero.setup3Sub"),
      view: "policies",
    },
  ];

  return (
    <div className="portal-hero">
      <div className="portal-hero__top">
        <div>
          <span className="portal-hero__eyebrow">
            {t("portal.procurement.hero.eyebrow")}
          </span>
          <span className="portal-hero__company">
            {t("portal.procurement.hero.company")}
          </span>
        </div>
        <div className="portal-hero__chips">
          {inTrial && snapshot.trialEndsAt && (
            <button
              type="button"
              className="portal-hero__chip portal-hero__chip--action"
              onClick={onManageTrial}
            >
              {t("portal.procurement.journey.daysLeft", {
                count: daysLeft(snapshot.trialEndsAt),
              })}
            </button>
          )}
          {stage !== "active" && (
            <button
              type="button"
              className="portal-hero__chip portal-hero__chip--action"
              onClick={onKeyDocs}
            >
              {t("portal.procurement.hero.keyDocs")}
            </button>
          )}
          {stage !== "active" && (
            <button
              type="button"
              className="portal-hero__chip portal-hero__chip--action"
              onClick={onInvite}
            >
              {t("portal.procurement.hero.inviteTeammates")}
            </button>
          )}
          <button
            type="button"
            className="portal-hero__chip portal-hero__chip--action"
            onClick={onSchedule}
          >
            {t("portal.procurement.hero.scheduleCall")}
          </button>
        </div>
      </div>

      <div className="portal-hero__stepper">
        <StageStepper journey={JOURNEY} currentStage={stage} />
      </div>

      {inTrial && (
        <ul className="portal-hero__checklist">
          {setupSteps.map((s) => (
            <li key={s.title}>
              <button type="button" onClick={() => onNavigate(s.view)}>
                <span className="portal-hero__check-dot" aria-hidden />
                <span className="portal-hero__check-text">
                  <span className="portal-hero__check-title">{s.title}</span>
                  <span className="portal-hero__check-sub">{s.sub}</span>
                </span>
                <span className="portal-hero__check-pill">
                  {t("portal.procurement.hero.notStarted")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="portal-hero__next">
        <span className="portal-hero__next-label">
          <span className="portal-hero__next-dot" />
          {t("portal.procurement.hero.nextStep", { action: cta })}
        </span>
        <div className="portal-hero__next-actions">
          <Button
            variant="gradient"
            accent="purple"
            loading={busy}
            onClick={onExpand}
          >
            {stage === "active" ? t("portal.procurement.hero.open") : cta}
          </Button>
        </div>
      </div>
    </div>
  );
}

function daysLeft(iso: string): number {
  const end = new Date(iso).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
