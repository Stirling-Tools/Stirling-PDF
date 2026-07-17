import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { money } from "@portal/components/procurement/format";
import { DownloadIcon } from "@portal/components/icons";
import type { QuoteResult } from "@portal/api/procurement";
import "@portal/views/Procurement.css";

/**
 * The quote step: the buyer reviews the plain, itemised quote (and can download it) before taking on
 * the enterprise agreement. Accepting here advances to the agreement step only — it does NOT charge
 * Stripe; the commitment happens when the agreement is signed. Kept deliberately separate from the
 * legal documents so a buyer can circulate the quote internally first.
 */
export function QuoteReview({
  quote,
  busy,
  downloading,
  onAccept,
  onDownload,
  onEdit,
}: {
  quote: QuoteResult;
  busy: boolean;
  downloading: boolean;
  /** Accept the quote and advance to the agreement step (no Stripe charge). */
  onAccept: () => void;
  onDownload: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const poNumber = quote.config.poNumber?.trim();

  return (
    <Card padding="loose">
      <span className="portal-proc__eyebrow">
        {t("portal.procurement.review.eyebrow")}
      </span>
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.review.title")}
      </h3>
      <p className="portal-proc__subtitle">
        {t("portal.procurement.review.subtitle")}
      </p>

      <div className="portal-proc__quote-head">
        <span className="portal-proc__quote-number">{quote.quoteNumber}</span>
        {quote.validUntil && (
          <span className="portal-proc__quote-valid">
            {t("portal.procurement.review.validUntil", {
              date: new Date(quote.validUntil).toLocaleDateString(),
            })}
          </span>
        )}
      </div>

      <ul className="portal-proc__quote-lines">
        {quote.lineItems.map((li) => (
          <li key={li.key} data-kind={li.kind}>
            <span>{li.label}</span>
            <span>{money(li.amountMinor, quote.currency)}</span>
          </li>
        ))}
      </ul>

      <div className="portal-proc__quote-total">
        <span>{t("portal.procurement.review.annual")}</span>
        <strong>{money(quote.annualNetMinor, quote.currency)}</strong>
      </div>
      <p className="portal-proc__quote-tcv">
        {t("portal.procurement.review.tcv", {
          years: quote.config.termYears,
          tcv: money(quote.tcvMinor, quote.currency),
        })}
      </p>
      <p className="portal-proc__quote-tcv">
        {t("portal.procurement.review.renewal", {
          amount: money(quote.renewalAnnualNetMinor, quote.currency),
          pct: quote.cpiRatePct,
        })}
      </p>
      {poNumber && (
        <p className="portal-proc__quote-tcv">
          {t("portal.procurement.review.poNumber", { po: poNumber })}
        </p>
      )}

      <div className="portal-proc__payment-actions">
        <Button
          variant="primary"
          accent="premium"
          loading={busy}
          onClick={onAccept}
        >
          {t("portal.procurement.review.acceptCta")}
        </Button>
        <Button
          variant="secondary"
          leftSection={<DownloadIcon size={15} />}
          loading={downloading}
          onClick={onDownload}
        >
          {t("portal.procurement.review.downloadCta")}
        </Button>
        <Button variant="tertiary" onClick={onEdit}>
          {t("portal.procurement.milestone.edit")}
        </Button>
      </div>
    </Card>
  );
}
