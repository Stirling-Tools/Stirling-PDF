import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import {
  FLOW_JOURNEY,
  type DealStage,
  type ProcurementSnapshot,
} from "@processor/api/procurement";
import {
  CalendarIcon,
  CheckIcon,
  DocumentsIcon,
  KeyIcon,
  UserPlusIcon,
} from "@processor/components/icons";
import { warmCalendly } from "@processor/components/procurement/CalendlyInline";
import { openApiUrl } from "@processor/api/externalUrl";
import "@processor/views/Procurement.css";

/** What each stage asks of the buyer, read out in the stage sentence. */
const STAGE_SENTENCE: Record<DealStage, string> = {
  // Exploring sits on the Trial rung: same sentence, since the ask is what differs.
  exploring: "processor.procurement.hero.sentenceTrial",
  trial: "processor.procurement.hero.sentenceTrial",
  quote: "processor.procurement.hero.sentenceQuote",
  security: "processor.procurement.hero.sentenceAgreement",
  procurement: "processor.procurement.hero.sentencePayment",
  active: "processor.procurement.hero.sentenceLive",
};

/** The primary action for each stage; expanding the flow runs it. */
const STAGE_CTA: Record<DealStage, string> = {
  exploring: "processor.procurement.hero.ctaExploring",
  trial: "processor.procurement.hero.ctaTrial",
  quote: "processor.procurement.hero.ctaQuote",
  security: "processor.procurement.hero.ctaAgreement",
  // Same label whether it links straight to Stripe or, lacking an invoice URL, opens the stage dialog
  // where the invoice actions live — the buyer is being sent to the invoice either way.
  procurement: "processor.procurement.payment.viewInvoice",
  active: "processor.procurement.hero.open",
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
  onAcceptQuote,
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
  /**
   * Accept the issued quote, which advances the deal to the agreement. Offered here rather than
   * inside the quote review so the buyer can circulate the quote and come back to decide.
   */
  onAcceptQuote: () => void;
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
  // A live quote is sitting with the buyer. A draft (or an expired/cancelled one) is not something to
  // accept — that stage still means "finish building it".
  const quoteAwaitingDecision =
    stage === "quote" &&
    (snapshot.latestQuote?.status === "sent" ||
      snapshot.latestQuote?.status === "open");
  // Paying happens on Stripe, so the card links straight there rather than opening a dialog whose only
  // real action was the same link. Without an invoice URL there is nothing to link to, so the stage
  // falls back to its dialog, where the signed agreement is still reachable.
  const invoiceUrl =
    stage === "procurement" ? snapshot.latestQuote?.invoiceUrl : null;
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
    <div className="processor-hero">
      <div className="processor-hero__top">
        <div className="processor-hero__ident">
          <span className="processor-hero__eyebrow">
            {company
              ? t("processor.procurement.hero.eyebrowCompany", { company })
              : t("processor.procurement.hero.eyebrow")}
          </span>

          <div
            className="processor-hero__bar"
            role="img"
            aria-label={t("processor.procurement.hero.barAria", {
              current: currentIdx + 1,
              total: FLOW_JOURNEY.length,
            })}
          >
            {FLOW_JOURNEY.map((s, i) => (
              <span key={s.stage} data-on={i <= currentIdx || undefined} />
            ))}
          </div>

          <p className="processor-hero__sentence">
            <strong>{t(FLOW_JOURNEY[currentIdx].label)}</strong>
            {` · ${t(STAGE_SENTENCE[stage])} `}
            {nextStage && (
              <span className="processor-hero__sentence-next">
                {t("processor.procurement.hero.next", {
                  stage: t(nextStage.label),
                })}
              </span>
            )}
          </p>

          {inTrial && snapshot.trialEndsAt && (
            <div className="processor-hero__chips">
              <button
                type="button"
                className="processor-hero__chip processor-hero__chip--action"
                onClick={onManageTrial}
              >
                {t("processor.procurement.journey.daysLeft", {
                  count: daysLeft(snapshot.trialEndsAt),
                })}
              </button>
            </div>
          )}
        </div>
      </div>

      {isLive && (
        <div className="processor-hero__live">
          <span className="processor-hero__live-tile" aria-hidden>
            <CheckIcon size={15} />
          </span>
          <span className="processor-hero__live-text">
            <span className="processor-hero__live-title">
              {t("processor.procurement.hero.liveTitle")}
            </span>
            <span className="processor-hero__live-sub">
              {t("processor.procurement.hero.liveSub")}
            </span>
          </span>
        </div>
      )}

      <div className="processor-hero__cta">
        {/* An issued quote is a decision point, so the card carries both halves of it: accept it, or
            open it again to read and circulate first. Every other stage has one next step. */}
        {quoteAwaitingDecision ? (
          <>
            <Button variant="primary" loading={busy} onClick={onAcceptQuote}>
              {t("processor.procurement.review.acceptCta")}
            </Button>
            <Button variant="secondary" onClick={onExpand}>
              {t("processor.procurement.hero.ctaReviewQuote")}
            </Button>
          </>
        ) : invoiceUrl ? (
          <Button variant="primary" onClick={() => openApiUrl(invoiceUrl)}>
            {t("processor.procurement.payment.viewInvoice")}
          </Button>
        ) : (
          <Button variant="primary" loading={busy} onClick={onExpand}>
            {t(STAGE_CTA[stage])}
          </Button>
        )}
        <div className="processor-hero__icons">
          {snapshot.licenseKey && (
            <IconAction
              label={t("processor.procurement.hero.licenseKey")}
              onClick={onLicense}
            >
              <KeyIcon size={15} />
            </IconAction>
          )}
          <IconAction
            label={t("processor.procurement.hero.documents")}
            onClick={onDocuments}
          >
            <DocumentsIcon size={15} />
          </IconAction>
          {!isLive && (
            <IconAction
              label={t("processor.procurement.hero.inviteTeammates")}
              onClick={onInvite}
            >
              <UserPlusIcon size={15} />
            </IconAction>
          )}
          {canSchedule && (
            <IconAction
              label={t("processor.procurement.hero.scheduleCall")}
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
      className="processor-hero__iconbtn"
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
