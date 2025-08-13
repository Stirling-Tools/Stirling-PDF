import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useChangePermissionsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("changePermissions.tooltip.header.title", "Change Permissions")
    },
    tips: [
      {
        title: t("changePermissions.tooltip.description.title", "Description"),
        description: t("changePermissions.tooltip.description.text", "Changes document permissions. Warning: To make these restrictions unchangeable, use the Add Password tool to set an owner password.")
      }
    ]
  };
};