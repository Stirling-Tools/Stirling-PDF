import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useRemovePasswordTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("removePassword.title", "Remove Password")
    },
    tips: [
      {
        description: t(
          "removePassword.tooltip.description",
          "Removing password protection requires the current password that was used to encrypt the PDF. This will decrypt the document, making it accessible without a password."
        )
      }
    ]
  };
};
