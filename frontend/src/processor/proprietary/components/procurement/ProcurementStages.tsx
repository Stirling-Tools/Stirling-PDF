import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui";
import { copyText } from "@editor/utils/copyText";
import "@processor/views/Procurement.css";

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
    void copyText(licenseKey).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
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
