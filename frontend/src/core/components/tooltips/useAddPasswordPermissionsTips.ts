import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAddPasswordPermissionsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("addPassword.tooltip.permissions.title", "Change Permissions")
    },
    tips: [
      {
        description: t("addPassword.tooltip.permissions.text", "These permissions control what users can do with the PDF. Most effective when combined with an owner password."),
      }
    ]
  };
};
