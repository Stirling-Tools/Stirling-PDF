import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import "@portal/views/Procurement.css";

/**
 * The stage-specific cards shown inside the procurement takeover modal once a quote exists: the
 * issued-quote milestone, the subscription-created payment step, and the live confirmation. Each is
 * a pure presentational view driven by props; ProcurementHome owns the state and the actions.
 */

/** The subscription-created step: pay or download the first invoice. */
export function PaymentStageCard({
  invoiceUrl,
  invoicePdf,
}: {
  invoiceUrl?: string | null;
  invoicePdf?: string | null;
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
              variant="primary"
              accent="premium"
              onClick={() => window.open(invoiceUrl, "_blank", "noopener")}
            >
              {t("portal.procurement.payment.viewInvoice")}
            </Button>
          )}
          {invoicePdf && (
            <Button
              variant="secondary"
              onClick={() => window.open(invoicePdf, "_blank", "noopener")}
            >
              {t("portal.procurement.payment.downloadInvoice")}
            </Button>
          )}
        </div>
      )}
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

/**
 * The team's licence key with Copy — and, when the paid offline add-on was taken, a download for
 * the air-gapped licence file. Shown from the trial step onward (the key exists from the trial and
 * is upgraded in place at accept), so it lives outside any single stage card.
 */
export function LicensePanel({
  licenseKey,
  offlineAvailable,
  downloadingLicense,
  onDownloadOffline,
}: {
  licenseKey: string;
  offlineAvailable: boolean;
  downloadingLicense: boolean;
  onDownloadOffline: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    void navigator.clipboard?.writeText(licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="portal-proc__license">
      <span className="portal-proc__license-label">
        {t("portal.procurement.license.label")}
      </span>
      <code className="portal-proc__license-key">{licenseKey}</code>
      <div className="portal-proc__payment-actions">
        <Button variant="secondary" onClick={copyKey}>
          {copied
            ? t("portal.procurement.license.copied")
            : t("portal.procurement.license.copy")}
        </Button>
        {offlineAvailable && (
          <Button
            variant="tertiary"
            loading={downloadingLicense}
            onClick={onDownloadOffline}
          >
            {t("portal.procurement.license.downloadOffline")}
          </Button>
        )}
      </div>
      <p className="portal-proc__license-hint">
        {t("portal.procurement.license.hint")}
      </p>
    </div>
  );
}
