import { useTranslation } from "react-i18next";
import { Banner } from "@editor/ui/Banner";
import { Icon } from "@editor/ui/Icon";
import type { RightsManagedProtection } from "@editor/services/rightsManagedPdf";

export function RightsManagedPdfBanner({
  protection,
}: {
  protection: RightsManagedProtection;
}) {
  const { t } = useTranslation();
  const { permissions, label } = protection;
  const labelName = label
    ? label.parentName
      ? `${label.parentName} \\ ${label.name}`
      : label.name
    : (protection.templateName ??
      t("rightsManagedPdf.customPermissions", "Custom permissions"));
  const restrictions = [
    !permissions.edit &&
      t("rightsManagedPdf.noEdit", "Changes are not allowed"),
    !permissions.print &&
      t("rightsManagedPdf.noPrint", "Printing is not allowed"),
    !permissions.copy &&
      t("rightsManagedPdf.noCopy", "Copying text is not allowed"),
  ].filter((value): value is string => Boolean(value));
  const expiry =
    protection.validUntilEpochSeconds !== null
      ? t("rightsManagedPdf.expires", "Access expires {{date}}", {
          date: new Date(
            protection.validUntilEpochSeconds * 1000,
          ).toLocaleDateString(),
        })
      : null;
  const description = [
    restrictions.length > 0
      ? restrictions.join(" · ")
      : t("rightsManagedPdf.fullAccess", "You have full access"),
    expiry,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div data-testid="rights-managed-pdf-banner" style={{ padding: "0.5rem" }}>
      <Banner
        tone="info"
        icon={<Icon name="shield-check" size={18} />}
        title={t(
          "rightsManagedPdf.bannerTitle",
          "{{label}} · Microsoft Purview",
          {
            label: labelName,
          },
        )}
        description={description}
      />
    </div>
  );
}
