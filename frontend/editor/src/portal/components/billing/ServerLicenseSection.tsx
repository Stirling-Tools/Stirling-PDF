import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLicense } from "@app/contexts/LicenseContext";
import LicenseKeySection from "@app/components/shared/config/configSections/plan/LicenseKeySection";
import { KvRow } from "@app/billing/KvRow";
import { Banner, Button, Spinner } from "@app/ui";
import { Modal } from "@app/ui/Modal";

/** The caller must restrict this server-local license surface to administrators. */
export function ServerLicenseSection({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const { licenseInfo, loading, error, refetchLicense } = useLicense();
  const [dialog, setDialog] = useState<"view" | "update" | null>(null);
  const storedKey = licenseInfo?.licenseKey?.trim();
  const licenseKey =
    storedKey === "00000000-0000-0000-0000-000000000000"
      ? undefined
      : storedKey;
  const certificate = licenseKey?.startsWith("file:")
    ? licenseKey.slice(5)
    : null;
  const label = t("portal.billing.license.label", "License key");
  const updateLabel = licenseKey
    ? t("portal.billing.license.update", "Update")
    : t("portal.billing.license.add", "Add");

  if (loading && !licenseInfo)
    return <Spinner label={t("loading", "Loading...")} />;
  if (error)
    return (
      <Banner
        tone="danger"
        title={t("admin.error", "Error")}
        description={error}
        action={
          <Button onClick={() => void refetchLicense()}>
            {t("portal.accountLink.gate.retry", "Try again")}
          </Button>
        }
      />
    );

  return (
    <>
      <KvRow
        label={label}
        value={
          licenseKey
            ? certificate
              ? certificate.split(/[\\/]/).pop()
              : "••••••••••••••••"
            : t("portal.billing.license.empty", "No license installed")
        }
        door={
          <span className="billing-license__actions">
            {licenseKey && (
              <button type="button" onClick={() => setDialog("view")}>
                {t("portal.billing.license.view", "View")}
              </button>
            )}
            <button type="button" onClick={() => setDialog("update")}>
              {updateLabel}
            </button>
          </span>
        }
      />
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog === "view"
            ? label
            : licenseKey
              ? t("portal.billing.license.updateTitle", "Update license")
              : t("portal.billing.license.addTitle", "Add license")
        }
        width="lg"
        footer={
          dialog === "view" ? (
            <Button onClick={() => setDialog("update")}>{updateLabel}</Button>
          ) : undefined
        }
      >
        {dialog === "view" ? (
          <div>
            <p>
              {certificate
                ? t(
                    "admin.settings.premium.inputMethod.file",
                    "Certificate File",
                  )
                : label}
            </p>
            <code className="billing-license__value">
              {certificate ?? licenseKey}
            </code>
          </div>
        ) : dialog === "update" ? (
          <LicenseKeySection
            presentation="form"
            currentLicenseInfo={
              licenseKey ? (licenseInfo ?? undefined) : undefined
            }
            onSaved={() => {
              setDialog(null);
              onSaved();
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
