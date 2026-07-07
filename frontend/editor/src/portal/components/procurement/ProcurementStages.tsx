import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import type { QuoteResult } from "@portal/api/procurement";
import { money } from "@portal/components/procurement/format";
import "@portal/views/Procurement.css";

/**
 * The stage-specific cards shown inside the procurement takeover modal once a quote exists: the
 * issued-quote milestone, the subscription-created payment step, and the live confirmation. Each is
 * a pure presentational view driven by props; ProcurementHome owns the state and the actions.
 */

/** The issued Stripe Quote as a shareable milestone: itemised, with accept / download / edit. */
export function QuoteMilestoneCard({
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
  onAccept: () => void;
  onDownload: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="loose">
      <span className="portal-proc__eyebrow">
        {t("portal.procurement.milestone.eyebrow", {
          number: quote.quoteNumber,
        })}
      </span>
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.milestone.title")}
      </h3>
      {quote.config.businessName && (
        <p className="portal-proc__milestone-for">
          {t("portal.procurement.milestone.preparedFor", {
            company: quote.config.businessName,
          })}
        </p>
      )}
      <p className="portal-proc__subtitle">
        {t("portal.procurement.milestone.description")}
      </p>
      <ul className="portal-qb__lines portal-proc__milestone-lines">
        {quote.lineItems.map((li) => (
          <li key={li.key} data-kind={li.kind}>
            <span>{li.label}</span>
            <span>
              {li.kind === "INCLUDED"
                ? t("portal.procurement.builder.included")
                : money(li.amountMinor, quote.currency)}
            </span>
          </li>
        ))}
      </ul>
      <div className="portal-proc__milestone-totals">
        <span className="portal-proc__milestone-annual">
          {money(quote.annualNetMinor, quote.currency)}
          <small>{t("portal.procurement.milestone.perYear")}</small>
        </span>
        <span className="portal-proc__milestone-tcv">
          {t("portal.procurement.milestone.tcv", {
            value: money(quote.tcvMinor, quote.currency),
          })}
        </span>
      </div>
      <div className="portal-proc__payment-actions">
        <Button
          variant="gradient"
          accent="purple"
          loading={busy}
          onClick={onAccept}
        >
          {t("portal.procurement.milestone.accept")}
        </Button>
        <Button variant="outline" loading={downloading} onClick={onDownload}>
          {t("portal.procurement.milestone.download")}
        </Button>
        <Button variant="ghost" onClick={onEdit}>
          {t("portal.procurement.milestone.edit")}
        </Button>
      </div>
    </Card>
  );
}

/** The subscription-created step: pay/download the first invoice, or (demo) simulate payment. */
export function PaymentStageCard({
  invoiceUrl,
  invoicePdf,
  busy,
  onSimulate,
}: {
  invoiceUrl?: string | null;
  invoicePdf?: string | null;
  busy: boolean;
  onSimulate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="loose">
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.payment.title")}
      </h3>
      <p className="portal-proc__subtitle">
        {t("portal.procurement.payment.description")}
      </p>
      {(invoiceUrl || invoicePdf) && (
        <div className="portal-proc__payment-actions">
          {invoiceUrl && (
            <Button
              variant="gradient"
              accent="purple"
              onClick={() => window.open(invoiceUrl, "_blank", "noopener")}
            >
              {t("portal.procurement.payment.viewInvoice")}
            </Button>
          )}
          {invoicePdf && (
            <Button
              variant="outline"
              onClick={() => window.open(invoicePdf, "_blank", "noopener")}
            >
              {t("portal.procurement.payment.downloadInvoice")}
            </Button>
          )}
        </div>
      )}
      <div className="portal-proc__reset">
        <button type="button" onClick={onSimulate} disabled={busy}>
          {t("portal.procurement.payment.simulate")}
        </button>
      </div>
    </Card>
  );
}

/** The live confirmation once the deal is active. */
export function LiveStageCard() {
  const { t } = useTranslation();
  return (
    <Card padding="loose">
      <span className="portal-proc__eyebrow">
        {t("portal.procurement.live.eyebrow")}
      </span>
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.live.title")}
      </h3>
      <p className="portal-proc__subtitle">
        {t("portal.procurement.live.description")}
      </p>
    </Card>
  );
}
