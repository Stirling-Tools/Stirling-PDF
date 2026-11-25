import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import {
  FLOW_JOURNEY,
  type DealStage,
  type QuoteResult,
} from "@processor/api/procurement";
import { openApiUrl } from "@processor/api/externalUrl";
import type { ProcurementController } from "@processor/components/procurement/useProcurement";
import {
  daysLeft,
  longDate,
  money,
  trialLeftLabel,
} from "@processor/components/procurement/format";
import "@processor/views/Procurement.css";
import "@processor/views/Enterprise.css";

/** The trial's clock, and extending it while the deal is still at the trial stage. */
export function TrialPanel({
  trialStartedAt,
  trialEndsAt,
  extensionsUsed,
  maxExtensions,
  busy,
  onExtend,
}: {
  trialStartedAt: string | null;
  trialEndsAt: string;
  extensionsUsed: number;
  /** How many extensions the server allows; it enforces the cap. */
  maxExtensions: number;
  busy: boolean;
  onExtend?: () => void;
}) {
  const { t } = useTranslation();
  const ends = longDate(trialEndsAt);
  const maxed = extensionsUsed >= maxExtensions;
  const start = trialStartedAt ? new Date(trialStartedAt).getTime() : null;
  const end = new Date(trialEndsAt).getTime();
  const used =
    start != null && end > start
      ? Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
      : null;
  return (
    <div className="ent__aside">
      <span className="ent__aside-label">
        {t("portal.procurement.trial.title")}
      </span>
      <span
        className="ent__aside-figure"
        data-expired={daysLeft(trialEndsAt) === 0 || undefined}
      >
        {trialLeftLabel(t, trialEndsAt)}
      </span>
      {used != null && (
        <span className="ent__trial-bar" aria-hidden>
          <span style={{ width: `${used * 100}%` }} />
        </span>
      )}
      <p className="ent__text">
        {t("portal.procurement.trial.subtitle", { date: ends })}
      </p>
      {onExtend && (
        <>
          <p className="ent__hint">
            {maxed
              ? t("portal.procurement.trial.bodyMaxed")
              : t("portal.procurement.trial.body")}
          </p>
          <div className="ent__actions">
            <Button
              variant="tertiary"
              loading={busy}
              disabled={maxed}
              onClick={onExtend}
            >
              {maxed
                ? t("portal.procurement.trial.maxed")
                : t("portal.procurement.trial.extend")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

const SERVICE_LEVEL_LABEL: Record<string, string> = {
  standard: "portal.procurement.builder.slStandard",
  priority: "portal.procurement.builder.slPriority",
  dedicated: "portal.procurement.builder.slDedicated",
};

/** The issued quote's figures, so the buyer can weigh it without opening the paper. */
export function QuotePanel({
  quote,
  downloading,
  onDownload,
}: {
  quote: QuoteResult;
  downloading: boolean;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="ent__aside ent__quote">
      <span className="ent__aside-label">
        {t("portal.enterprise.quotePanel", "Your quote")}
        {quote.quoteNumber && (
          <span className="ent__quote-number">{quote.quoteNumber}</span>
        )}
      </span>
      <span className="ent__aside-figure">
        {money(quote.annualNetMinor, quote.currency)}
      </span>
      <span className="ent__quote-caption">
        {t("portal.procurement.review.annual")}
      </span>
      <dl className="ent__facts">
        {/* A seat count of 0 means none was recorded. */}
        {quote.config.users > 0 && (
          <div>
            <dt>{t("portal.procurement.builder.users")}</dt>
            <dd>{quote.config.users.toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>{t("portal.enterprise.deployment", "Deployment")}</dt>
          <dd>{t(`portal.procurement.setup.${quote.config.deployment}`)}</dd>
        </div>
        <div>
          <dt>{t("portal.procurement.builder.serviceLevel")}</dt>
          <dd>
            {SERVICE_LEVEL_LABEL[quote.config.serviceLevel]
              ? t(SERVICE_LEVEL_LABEL[quote.config.serviceLevel])
              : quote.config.serviceLevel}
          </dd>
        </div>
      </dl>
      <p className="ent__text">
        {t("portal.procurement.review.tcv", {
          years: quote.config.termYears,
          tcv: money(quote.tcvMinor, quote.currency),
        })}
      </p>
      <p className="ent__hint">
        {t("portal.procurement.review.renewal", {
          amount: money(quote.renewalAnnualNetMinor, quote.currency),
          pct: quote.cpiRatePct,
        })}
      </p>
      <div className="ent__actions">
        <Button variant="tertiary" loading={downloading} onClick={onDownload}>
          {t("portal.procurement.review.downloadCta")}
        </Button>
        {/* An accepted quote is a commitment, so its offer window no longer applies. */}
        {quote.validUntil && quote.status !== "accepted" && (
          <span className="ent__quote-valid">
            {t("portal.procurement.review.validUntil", {
              date: new Date(quote.validUntil).toLocaleDateString(undefined, {
                timeZone: "UTC",
              }),
            })}
          </span>
        )}
      </div>
    </div>
  );
}

/** A finished stage as it was left, to look back on without changing anything. */
export function StageReview({
  stage,
  controller,
}: {
  stage: DealStage;
  controller: ProcurementController;
}) {
  const { t } = useTranslation();
  const { data, latest } = controller;
  if (stage === "quote") {
    return latest ? (
      <QuotePanel
        quote={latest}
        downloading={controller.downloading}
        onDownload={controller.onDownloadPdf}
      />
    ) : null;
  }
  if (!data) return null;
  const company = latest?.config.businessName || data.businessName;
  const invoiceUrl = latest?.invoiceUrl;
  const { invoicePdf } = controller;
  return (
    <div className="ent__aside">
      {stage === "trial" && (
        <>
          <span className="ent__aside-label">
            {t("portal.enterprise.review.trialTitle", "Your trial")}
          </span>
          <dl className="ent__facts">
            <div>
              <dt>{t("portal.enterprise.review.started", "Started")}</dt>
              <dd>{longDate(data.trialStartedAt)}</dd>
            </div>
            <div>
              <dt>
                {t("portal.enterprise.review.trialEnds", "Trial end date")}
              </dt>
              <dd>{longDate(data.trialEndsAt)}</dd>
            </div>
            <div>
              <dt>{t("portal.enterprise.deployment", "Deployment")}</dt>
              <dd>{t(`portal.procurement.setup.${data.deployment}`)}</dd>
            </div>
            {data.seats > 0 && (
              <div>
                <dt>{t("portal.enterprise.review.people", "People")}</dt>
                <dd>{data.seats.toLocaleString()}</dd>
              </div>
            )}
            <div>
              <dt>
                {t("portal.enterprise.review.extensions", "Extensions used")}
              </dt>
              <dd>{data.trialExtensionsUsed}</dd>
            </div>
          </dl>
        </>
      )}
      {stage === "security" && (
        <>
          <span className="ent__aside-label">
            {t("portal.procurement.documents.agreement")}
          </span>
          <dl className="ent__facts">
            {data.agreementSignedVersion && (
              <div>
                <dt>{t("portal.enterprise.review.version", "Version")}</dt>
                <dd>{data.agreementSignedVersion}</dd>
              </div>
            )}
            {company && (
              <div>
                <dt>{t("portal.enterprise.review.company", "Company")}</dt>
                <dd>{company}</dd>
              </div>
            )}
          </dl>
          {data.agreementSignedVersion && (
            <div className="ent__actions">
              <Button
                variant="tertiary"
                loading={controller.downloadingAgreement}
                onClick={controller.onDownloadSignedAgreement}
              >
                {t("portal.procurement.documents.download")}
              </Button>
            </div>
          )}
        </>
      )}
      {stage === "procurement" && (
        <>
          <span className="ent__aside-label">
            {t("portal.procurement.documents.invoice")}
          </span>
          <p className="ent__text">
            {t(
              "portal.enterprise.review.paid",
              "Paid. Your invoice stays available here.",
            )}
          </p>
          <div className="ent__actions">
            {invoiceUrl && (
              <Button variant="tertiary" onClick={() => openApiUrl(invoiceUrl)}>
                {t("portal.enterprise.review.viewInvoice", "View invoice")}
              </Button>
            )}
            {invoicePdf && (
              <Button variant="tertiary" onClick={() => openApiUrl(invoicePdf)}>
                {t("portal.procurement.payment.downloadInvoice")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The hero's call to action: the deal's next step, or that it is live. */
export function HeroAction({
  controller,
  canManage,
  roleKnown,
  stage,
}: {
  controller: ProcurementController;
  canManage: boolean;
  roleKnown: boolean;
  stage: DealStage;
}) {
  const { t } = useTranslation();
  if (stage === "active") {
    return (
      <div className="ent__live">
        <Icon name="circle-check" size={22} />
        <div>
          <h2 className="ent__h3">{t("portal.procurement.live.title")}</h2>
          <p className="ent__text">
            {t("portal.procurement.live.description")}
          </p>
        </div>
      </div>
    );
  }
  if (!roleKnown) return null;
  return (
    <NextStep controller={controller} canManage={canManage} stage={stage} />
  );
}

/** What the buyer does next at this stage; a member follows along instead. */
function NextStep({
  controller,
  canManage,
  stage,
}: {
  controller: ProcurementController;
  canManage: boolean;
  stage: DealStage;
}) {
  const { t } = useTranslation();
  const { isIssued, busy, setOpen, latest, invoicePdf } = controller;
  const invoiceUrl = latest?.invoiceUrl;
  if (!canManage) {
    return (
      <p className="ent__note">
        {t(
          "portal.enterprise.memberDeal",
          "Your team leader runs this deal. You can follow its progress here.",
        )}
      </p>
    );
  }
  return (
    <div className="ent__actions">
      {stage === "trial" && (
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          {t("portal.procurement.hero.ctaTrial")}
        </Button>
      )}
      {stage === "quote" &&
        (isIssued ? (
          <>
            <Button
              variant="primary"
              size="md"
              loading={busy}
              onClick={() => void controller.onAcceptQuote()}
            >
              {t("portal.procurement.review.acceptCta")}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
              {t("portal.procurement.hero.ctaReviewQuote")}
            </Button>
          </>
        ) : (
          <Button variant="primary" size="md" onClick={() => setOpen(true)}>
            {t("portal.procurement.hero.ctaQuote")}
          </Button>
        ))}
      {stage === "security" && (
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          {t("portal.procurement.hero.ctaAgreement")}
        </Button>
      )}
      {stage === "procurement" && (
        <>
          {invoiceUrl && (
            <Button
              variant="primary"
              size="md"
              onClick={() => openApiUrl(invoiceUrl)}
            >
              {t("portal.procurement.payment.viewInvoice")}
            </Button>
          )}
          {invoicePdf && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => openApiUrl(invoicePdf)}
            >
              {t("portal.procurement.payment.downloadInvoice")}
            </Button>
          )}
          <p className="ent__hint ent__next-hint">
            {t("portal.procurement.payment.description")}
          </p>
        </>
      )}
    </div>
  );
}

/** Where the deal stands; stages with something to open are buttons. */
export function StageTracker({
  currentIdx,
  viewingIdx,
  isLive,
  actionFor,
}: {
  currentIdx: number;
  /** A finished stage open for review, marked apart from where the deal stands. */
  viewingIdx: number | null;
  isLive: boolean;
  actionFor: (index: number) => (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <ol
      className="ent__stages"
      aria-label={t("portal.enterprise.stagesLabel", "Progress")}
    >
      {FLOW_JOURNEY.map((s, index) => {
        const done = index < currentIdx || (isLive && index === currentIdx);
        const action = actionFor(index);
        const content = (
          <>
            <span className="ent__stage-dot">
              {done ? <Icon name="check" size={14} /> : index + 1}
            </span>
            <span className="ent__stage-label">{t(s.label)}</span>
          </>
        );
        return (
          <li
            key={s.stage}
            className="ent__stage"
            data-state={
              done ? "done" : index === currentIdx ? "current" : "next"
            }
            data-viewing={index === viewingIdx || undefined}
            aria-current={
              index === viewingIdx
                ? "page"
                : index === currentIdx
                  ? "step"
                  : undefined
            }
          >
            {action ? (
              <button type="button" className="ent__stage-btn" onClick={action}>
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
