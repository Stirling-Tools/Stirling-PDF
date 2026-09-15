import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { openApiUrl } from "@processor/api/externalUrl";
import "@processor/views/Procurement.css";

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
    <div className="processor-procstage">
      <span className="processor-proc__eyebrow">
        {t("processor.procurement.payment.eyebrow")}
      </span>
      <h3 className="processor-proc__builder-title">
        {t("processor.procurement.payment.title")}
      </h3>
      <p className="processor-proc__subtitle">
        {t("processor.procurement.payment.description")}
      </p>
      {(invoiceUrl || invoicePdf || signedAgreementVersion) && (
        <div className="processor-qb__foot processor-procstage__foot">
          <div className="processor-qb__foot-btns">
            {signedAgreementVersion && onDownloadSignedAgreement && (
              <Button
                variant="secondary"
                loading={downloadingAgreement}
                onClick={onDownloadSignedAgreement}
              >
                {t("processor.procurement.payment.downloadAgreement")}
              </Button>
            )}
            {invoicePdf && (
              <Button
                variant="secondary"
                onClick={() => openApiUrl(invoicePdf)}
              >
                {t("processor.procurement.payment.downloadInvoice")}
              </Button>
            )}
            {invoiceUrl && (
              <Button variant="primary" onClick={() => openApiUrl(invoiceUrl)}>
                {t("processor.procurement.payment.viewInvoice")}
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
    <div className="processor-procstage">
      <span className="processor-proc__eyebrow">
        {t("processor.procurement.live.eyebrow")}
      </span>
      <h3 className="processor-proc__builder-title">
        {t("processor.procurement.live.title")}
      </h3>
      <p className="processor-proc__subtitle">
        {t("processor.procurement.live.description")}
      </p>
      {signedAgreementVersion && onDownloadSignedAgreement && (
        <div className="processor-qb__foot processor-procstage__foot">
          <div className="processor-qb__foot-btns">
            <Button
              variant="secondary"
              loading={downloadingAgreement}
              onClick={onDownloadSignedAgreement}
            >
              {t("processor.procurement.payment.downloadAgreement")}
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
    <div className="processor-proc__license">
      <span className="processor-proc__license-label">
        {t("processor.procurement.license.label")}
      </span>
      <code className="processor-proc__license-key">{licenseKey}</code>
      <div className="processor-proc__payment-actions">
        <Button variant="secondary" onClick={copyKey}>
          {copied
            ? t("processor.procurement.license.copied")
            : t("processor.procurement.license.copy")}
        </Button>
        {offlineAvailable && (
          <Button
            variant="tertiary"
            loading={downloadingLicense}
            onClick={onDownloadOffline}
          >
            {t("processor.procurement.license.downloadOffline")}
          </Button>
        )}
      </div>
      <p className="processor-proc__license-hint">
        {t("processor.procurement.license.hint")}
      </p>
    </div>
  );
}
