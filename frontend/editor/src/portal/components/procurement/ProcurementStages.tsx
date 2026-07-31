import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import "@portal/views/Procurement.css";

/**
 * The stage-specific views shown inside the procurement takeover modal once the agreement is signed:
 * the subscription-created payment step and the live confirmation. Each is a pure presentational view
 * driven by props; the controller owns the state and the actions.
 *
 * Neither is wrapped in a Card: the dialog is already the surface, and a card inside it drew a second
 * border around content that filled it. Both wear the same eyebrow/title/description stack and put
 * their actions in the flow's footer bar, so the last two steps of the journey read like the ones
 * before them rather than like panels that wandered in.
 */

/** The subscription-created step: pay or download the first invoice, and the signed agreement. */
export function PaymentStageCard({
  invoiceUrl,
  invoicePdf,
  signedAgreementVersion,
  downloadingAgreement,
  onDownloadSignedAgreement,
}: {
  invoiceUrl?: string | null;
  invoicePdf?: string | null;
  /** Version label of the signed agreement PDF, if one is available to download. */
  signedAgreementVersion?: string | null;
  downloadingAgreement?: boolean;
  onDownloadSignedAgreement?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-procstage">
      <span className="portal-proc__eyebrow">
        {t("portal.procurement.payment.eyebrow")}
      </span>
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.payment.title")}
      </h3>
      <p className="portal-proc__subtitle">
        {t("portal.procurement.payment.description")}
      </p>
      {(invoiceUrl || invoicePdf || signedAgreementVersion) && (
        <div className="portal-qb__foot portal-procstage__foot">
          <div className="portal-qb__foot-btns">
            {signedAgreementVersion && onDownloadSignedAgreement && (
              <Button
                variant="secondary"
                loading={downloadingAgreement}
                onClick={onDownloadSignedAgreement}
              >
                {t("portal.procurement.payment.downloadAgreement")}
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
            {invoiceUrl && (
              <Button
                variant="primary"
                onClick={() => window.open(invoiceUrl, "_blank", "noopener")}
              >
                {t("portal.procurement.payment.viewInvoice")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The live confirmation once the deal is active. */
export function LiveStageCard({
  signedAgreementVersion,
  downloadingAgreement,
  onDownloadSignedAgreement,
}: {
  signedAgreementVersion?: string | null;
  downloadingAgreement?: boolean;
  onDownloadSignedAgreement?: () => void;
} = {}) {
  const { t } = useTranslation();
  return (
    <div className="portal-procstage">
      <span className="portal-proc__eyebrow">
        {t("portal.procurement.live.eyebrow")}
      </span>
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.live.title")}
      </h3>
      <p className="portal-proc__subtitle">
        {t("portal.procurement.live.description")}
      </p>
      {signedAgreementVersion && onDownloadSignedAgreement && (
        <div className="portal-qb__foot portal-procstage__foot">
          <div className="portal-qb__foot-btns">
            <Button
              variant="secondary"
              loading={downloadingAgreement}
              onClick={onDownloadSignedAgreement}
            >
              {t("portal.procurement.payment.downloadAgreement")}
            </Button>
          </div>
        </div>
      )}
    </div>
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
