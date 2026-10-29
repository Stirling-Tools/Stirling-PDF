import { useTranslation } from "react-i18next";
import type { RightsManagedProtection } from "@editor/services/rightsManagedPdf";
import {
  ProtectionIndicator,
  type ProtectionSummary,
} from "@editor/components/viewer/protection/ProtectionIndicator";
import { openExternal } from "@editor/platform/openExternal";

export function RightsManagedPdfBanner({
  protection,
  fileName,
}: {
  protection: RightsManagedProtection;
  fileName?: string;
}) {
  const { t } = useTranslation();
  const { permissions, label } = protection;
  const title = label
    ? label.parentName
      ? `${label.parentName} \\ ${label.name}`
      : label.name
    : protection.custom || !protection.templateName
      ? t("rightsManagedPdf.customPermissions", "Custom permissions")
      : protection.templateName;
  const restricted =
    !permissions.edit || !permissions.print || !permissions.copy;
  const summary = !restricted
    ? t("protection.fullAccess", "Full access")
    : !permissions.edit && !permissions.print && !permissions.copy
      ? t("protection.viewOnly", "View only")
      : t("protection.limitedAccess", "Limited access");
  const facts = [
    {
      label: t("protection.expiresLabel", "Access expires"),
      value:
        protection.validUntilEpochSeconds !== null
          ? new Date(
              protection.validUntilEpochSeconds * 1000,
            ).toLocaleDateString()
          : t("protection.never", "Never"),
    },
  ];
  const summaryModel: ProtectionSummary = {
    fileName,
    icon: "shield-check",
    iconColor: "var(--c-accent-fg, var(--c-primary))",
    title,
    color: label?.color ?? null,
    summary,
    owner: protection.owner,
    source: t("protection.sourcePurview", "Microsoft Purview"),
    rights: [
      { name: t("protection.right.view", "View"), allowed: permissions.view },
      {
        name: t("encryptedPdfUnlock.printing", "Printing"),
        allowed: permissions.print,
      },
      {
        name: t("encryptedPdfUnlock.copying", "Copying content"),
        allowed: permissions.copy,
      },
      {
        name: t("encryptedPdfUnlock.editing", "Editing"),
        allowed: permissions.edit,
      },
      {
        name: t("encryptedPdfUnlock.annotations", "Annotations"),
        allowed: permissions.comment || permissions.edit,
      },
      {
        name: t("protection.right.export", "Save a copy"),
        allowed: permissions.export,
      },
    ],
    facts,
    actions:
      restricted && protection.owner && !permissions.owner
        ? [
            {
              label: t("protection.emailOwner", "Email the owner"),
              onClick: () => void openExternal(`mailto:${protection.owner}`),
            },
          ]
        : [],
  };
  return <ProtectionIndicator protection={summaryModel} />;
}
