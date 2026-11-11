import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useChangePermissionsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changePermissions.tooltip.header.title", "Change Permissions"),
    },
    tips: [
      {
        description: t(
          "changePermissions.tooltip.description.text",
          "Changes document permissions, allowing/disallowing access to different features in PDF readers.",
        ),
      },
      {
        title: t("warning.tooltipTitle", "Warning"),
        description: t(
          "changePermissions.tooltip.warning.text",
          "Compatible PDF applications honour these permissions. Keep a separate permissions password to control changes to the restrictions.",
        ),
      },
    ],
  };
};
