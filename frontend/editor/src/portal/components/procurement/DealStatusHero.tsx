import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import type { ViewId } from "@portal/contexts/ViewContext";
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
  trial: "portal.procurement.hero.sentenceTrial",
  quote: "portal.procurement.hero.sentenceQuote",
  security: "portal.procurement.hero.sentenceAgreement",
  procurement: "portal.procurement.hero.sentencePayment",
  active: "portal.procurement.hero.sentenceLive",
};

/** The primary action for each stage; expanding the flow runs it. */
const STAGE_CTA: Record<DealStage, string> = {
  trial: "portal.procurement.hero.ctaTrial",
  quote: "portal.procurement.hero.ctaQuote",
  security: "portal.procurement.hero.ctaAgreement",
  procurement: "portal.procurement.hero.ctaPayment",
  active: "portal.procurement.hero.open",
};

/**
 * The enterprise deal-status hero on Home (procurement lives here, not as a nav tab) — this card IS
 * the procurement surface. It carries the journey as a segmented progress band plus a stage
 * sentence, the trial rollout checklist, and one primary action with quiet icon buttons beside it;
 * the flow itself opens in the takeover modal. Matches the marketing prototype.
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
  onNavigate,
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
  onNavigate: (view: ViewId) => void;
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
  // The legal entity is only known once the buyer completes the quote's details step; until then the
  // eyebrow stands alone rather than showing a placeholder company.
  const company = snapshot.latestQuote?.config.businessName?.trim();

  const currentIdx = Math.max(
    0,
    FLOW_JOURNEY.findIndex((s) => s.stage === stage),
  );
  const nextStage = FLOW_JOURNEY[currentIdx + 1];

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
        <Button
          variant="primary"
          accent="premium"
          loading={busy}
          onClick={onExpand}
        >
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
