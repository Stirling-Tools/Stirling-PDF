import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import type {
  QuoteLineItem,
  QuoteResult,
  RateCard,
} from "@processor/api/procurement";
import { money } from "@processor/components/procurement/format";
import {
  perRunRate,
  POSTURES,
} from "@processor/components/procurement/quotePricing";

/**
 * The issued quote as the buyer circulates it. Shows the real issued figures, not the builder's
 * client-side preview, so it matches the PDF and the Stripe quote exactly.
 */
export function QuotePaper({
  issued,
  rates,
  downloading,
  onDownload,
}: {
  issued: QuoteResult;
  rates: RateCard;
  downloading: boolean;
  onDownload?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-qb__papertray">
      <div className="portal-surface portal-qb__paper">
        <div className="portal-qb__paper-head">
          <div>
            <div className="portal-qb__paper-brand">
              {t("portal.procurement.builder.paperBrand", "Stirling PDF")}
            </div>
            <div className="portal-qb__paper-eyebrow">
              {t("portal.procurement.builder.paperEyebrow")}
            </div>
          </div>
          <div className="portal-qb__paper-meta">
            <div className="portal-qb__quote-number">{issued.quoteNumber}</div>
            {issued.validUntil && (
              <div>
                {t("portal.procurement.review.validUntil", {
                  date: new Date(issued.validUntil).toLocaleDateString(
                    undefined,
                    {
                      timeZone: "UTC",
                    },
                  ),
                })}
              </div>
            )}
            {/* On the document rather than in the footer: it downloads this paper, so it
                      belongs to it, and the footer stays the flow's own Back/Done. */}
            <Button
              variant="tertiary"
              size="sm"
              className="portal-qb__paper-download"
              leftSection={<Icon name="download" size={14} />}
              loading={downloading}
              onClick={onDownload}
            >
              {t("portal.procurement.review.downloadCta")}
            </Button>
          </div>
        </div>

        {issued.config.businessName?.trim() && (
          <div className="portal-qb__paper-for">
            <div className="portal-qb__paper-eyebrow">
              {t("portal.procurement.builder.paperFor")}
            </div>
            <div className="portal-qb__paper-company">
              {issued.config.businessName}
            </div>
          </div>
        )}

        <ul className="portal-qb__lines">
          {issued.lineItems.map((li) => (
            <li key={li.key} data-kind={li.kind}>
              <span>{lineLabel(li, issued, rates, t)}</span>
              <span>
                {/* Marked, since one-off charges sit outside the yearly fee totalled below. */}
                {li.kind === "ONE_TIME" && (
                  <span className="portal-qb__line-note">
                    {t("portal.procurement.review.oneTime")}
                  </span>
                )}
                {money(li.amountMinor, issued.currency)}
              </span>
            </li>
          ))}
        </ul>

        <div className="portal-qb__total">
          <div>
            <div className="portal-qb__total-label">
              {t("portal.procurement.review.annual")}
            </div>
            <div className="portal-qb__total-tcv">
              {t("portal.procurement.review.tcv", {
                years: issued.config.termYears,
                tcv: money(issued.tcvMinor, issued.currency),
              })}
            </div>
            <div className="portal-qb__total-tcv">
              {t("portal.procurement.review.renewal", {
                amount: money(issued.renewalAnnualNetMinor, issued.currency),
                pct: issued.cpiRatePct,
              })}
            </div>
            {issued.config.poNumber?.trim() && (
              <div className="portal-qb__total-tcv">
                {t("portal.procurement.review.poNumber", {
                  po: issued.config.poNumber.trim(),
                })}
              </div>
            )}
          </div>
          <div className="portal-qb__total-num">
            <strong>{money(issued.annualNetMinor, issued.currency)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * An issued quote's line in the viewer's language. The server words its lines in English for the
 * PDF and Stripe, so each known line is rebuilt from its key and the quote's own inputs; a line
 * this page does not know keeps the server's wording.
 */
function lineLabel(
  li: QuoteLineItem,
  quote: QuoteResult,
  rates: RateCard,
  t: TFunction,
): string {
  const cfg = quote.config;
  switch (li.key) {
    case "usage": {
      const posture = POSTURES.find((p) => p.intensity === cfg.intensity);
      if (!posture) return li.label;
      return t("portal.procurement.builder.line.usage", {
        volume: cfg.volume.toLocaleString(),
        rate: new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: quote.currency || "USD",
          currencyDisplay: "narrowSymbol",
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        }).format(perRunRate(cfg, rates) * Math.max(1, cfg.intensity)),
        posture: t(`portal.procurement.builder.posture_${posture.key}`),
      });
    }
    case "seats":
      return cfg.users > 0
        ? t("portal.procurement.builder.line.seats", {
            count: cfg.users,
            users: cfg.users.toLocaleString(),
          })
        : t("portal.procurement.builder.line.seatsUnset");
    case "multi-year":
      return t("portal.procurement.builder.line.multiYear", {
        count: cfg.termYears,
      });
    case "support":
      return t("portal.procurement.builder.line.support");
    case "deployment":
      return t("portal.procurement.builder.line.deployment", {
        deployment: t(`portal.procurement.setup.${cfg.deployment}`),
      });
    case "indemnification":
      return t("portal.procurement.builder.line.indemnification");
    case "qbr":
      return t("portal.procurement.builder.line.qbr");
    case "training":
      return t("portal.procurement.builder.line.training");
    default:
      return li.label;
  }
}
