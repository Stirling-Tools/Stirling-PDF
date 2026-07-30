import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import {
  FLOW_JOURNEY,
  type DealStage,
  type ProcurementSnapshot,
} from "@portal/api/procurement";
import {
  CalendarIcon,
  DocumentsIcon,
  KeyIcon,
  UserPlusIcon,
} from "@portal/components/icons";
import { warmCalendly } from "@portal/components/procurement/CalendlyInline";
import "@portal/views/Procurement.css";

/** What each stage asks of the buyer, read out in the stage sentence. */
const STAGE_SENTENCE: Record<DealStage, string> = {
  // Exploring sits on the Trial rung: same sentence, since the ask is what differs.
  exploring: "portal.procurement.hero.sentenceTrial",
  trial: "portal.procurement.hero.sentenceTrial",
  quote: "portal.procurement.hero.sentenceQuote",
  security: "portal.procurement.hero.sentenceAgreement",
  procurement: "portal.procurement.hero.sentencePayment",
  active: "portal.procurement.hero.sentenceLive",
};

/** The primary action for each stage; expanding the flow runs it. */
const STAGE_CTA: Record<DealStage, string> = {
  exploring: "portal.procurement.hero.ctaExploring",
  trial: "portal.procurement.hero.ctaTrial",
  quote: "portal.procurement.hero.ctaQuote",
  security: "portal.procurement.hero.ctaAgreement",
  procurement: "portal.procurement.hero.ctaPayment",
  active: "portal.procurement.hero.open",
};

/**
 * The enterprise deal-status hero on Home (procurement lives here, not as a nav tab) — this card IS
 * the procurement surface. It carries the journey as a segmented progress band plus a stage
 * sentence, and one primary action with quiet icon buttons beside it; the flow itself opens in the
 * takeover modal. Rollout setup lives in the non-procurement setup checklist, not here.
 */
export function DealStatusHero({
  snapshot,
  busy = false,
  canSchedule,
  onExpand,
  onLicense,
  onInvite,
  onSchedule,
  onManageTrial,
  onDocuments,
}: {
  snapshot: ProcurementSnapshot;
  busy?: boolean;
  /** Booking a call runs through the linked account (its email prefills Calendly), so the
   * "Schedule a call" action only appears when the org has linked its account. */
  canSchedule: boolean;
  onExpand: () => void;
  onLicense: () => void;
  onInvite: () => void;
  onSchedule: () => void;
  onManageTrial: () => void;
  /** Open the Documents reference (agreement, quote, invoice, EULA, SLA, subprocessors). */
  onDocuments: () => void;
}) {
  const { t } = useTranslation();

  // Warm Calendly's connections + widget script as soon as the "Schedule a call" action is
  // available, so opening the scheduler initialises quickly instead of paying a cold fetch.
  useEffect(() => {
    if (canSchedule) warmCalendly();
  }, [canSchedule]);

  const stage = snapshot.stage ?? "trial";
  const inTrial = stage === "trial";
  const isLive = stage === "active";
  // Known from trial setup onward. The quote's own copy wins when present, since the buyer may have
  // corrected it there; before either exists the eyebrow stands alone rather than inventing a name.
  const company =
    snapshot.latestQuote?.config.businessName?.trim() ||
    snapshot.businessName?.trim();

  // Exploring is presented as the Trial rung — same position, sentence and next step — because the
  // buyer has entered the journey; only the ask differs, since no trial has actually started.
  const journeyStage = stage === "exploring" ? "trial" : stage;
  const currentIdx = Math.max(
    0,
    FLOW_JOURNEY.findIndex((s) => s.stage === journeyStage),
  );
  const nextStage = FLOW_JOURNEY[currentIdx + 1];

  return (
    <div className="portal-hero">
      <div className="portal-hero__top">
        <div className="portal-hero__ident">
          <span className="portal-hero__eyebrow">
            {company
              ? t("portal.procurement.hero.eyebrowCompany", { company })
              : t("portal.procurement.hero.eyebrow")}
          </span>

          <div
            className="portal-hero__bar"
            role="img"
            aria-label={t("portal.procurement.hero.barAria", {
              current: currentIdx + 1,
              total: FLOW_JOURNEY.length,
            })}
          >
            {FLOW_JOURNEY.map((s, i) => (
              <span key={s.stage} data-on={i <= currentIdx || undefined} />
            ))}
          </div>

          <p className="portal-hero__sentence">
            <strong>{t(FLOW_JOURNEY[currentIdx].label)}</strong>
            {` · ${t(STAGE_SENTENCE[stage])} `}
            {nextStage && (
              <span className="portal-hero__sentence-next">
                {t("portal.procurement.hero.next", {
                  stage: t(nextStage.label),
                })}
              </span>
            )}
          </p>

          {inTrial && snapshot.trialEndsAt && (
            <div className="portal-hero__chips">
              <button
                type="button"
                className="portal-hero__chip portal-hero__chip--action"
                onClick={onManageTrial}
              >
                {t("portal.procurement.journey.daysLeft", {
                  count: daysLeft(snapshot.trialEndsAt),
                })}
              </button>
            </div>
          )}
        </div>
      </div>

      {isLive && (
        <div className="portal-hero__live">
          <span className="portal-hero__live-tile" aria-hidden>
            ✓
          </span>
          <span className="portal-hero__live-text">
            <span className="portal-hero__live-title">
              {t("portal.procurement.hero.liveTitle")}
            </span>
            <span className="portal-hero__live-sub">
              {t("portal.procurement.hero.liveSub")}
            </span>
          </span>
        </div>
      )}

      <div className="portal-hero__cta">
        <Button variant="primary" loading={busy} onClick={onExpand}>
          {t(STAGE_CTA[stage])}
        </Button>
        <div className="portal-hero__icons">
          {snapshot.licenseKey && (
            <IconAction
              label={t("portal.procurement.hero.licenseKey")}
              onClick={onLicense}
            >
              <KeyIcon size={15} />
            </IconAction>
          )}
          <IconAction
            label={t("portal.procurement.hero.documents")}
            onClick={onDocuments}
          >
            <DocumentsIcon size={15} />
          </IconAction>
          {!isLive && (
            <IconAction
              label={t("portal.procurement.hero.inviteTeammates")}
              onClick={onInvite}
            >
              <UserPlusIcon size={15} />
            </IconAction>
          )}
          {canSchedule && (
            <IconAction
              label={t("portal.procurement.hero.scheduleCall")}
              onClick={onSchedule}
            >
              <CalendarIcon size={15} />
            </IconAction>
          )}
        </div>
      </div>
    </div>
  );
}

/** A quiet icon-only secondary action; its label carries in the tooltip and to screen readers. */
function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="portal-hero__iconbtn"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function daysLeft(iso: string): number {
  const end = new Date(iso).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
