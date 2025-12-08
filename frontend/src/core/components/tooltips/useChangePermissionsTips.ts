import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useChangePermissionsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changePermissions.tooltip.header.title", "Change Permissions")
    },
    tips: [
      {
        description: t("changePermissions.tooltip.description.text", "Changes document permissions, allowing/disallowing access to different features in PDF readers.")
      },
      {
        title: t("warning.tooltipTitle", "Warning"),
        description: t("changePermissions.tooltip.warning.text", "To make these permissions unchangeable, use the Add Password tool to set an owner password.")
      }
    ]
  };
};
