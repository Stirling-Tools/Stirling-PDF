import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAddPasswordTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("addPassword.tooltip.header.title", "Password Protection Overview")
    },
    tips: [
      {
        title: t("addPassword.tooltip.passwords.title", "Password Types"),
        description: t("addPassword.tooltip.passwords.text", "User passwords restrict opening the document, while owner passwords control what can be done with the document once opened. You can set both or just one."),
        bullets: [
          t("addPassword.tooltip.passwords.bullet1", "User Password: Required to open the PDF"),
          t("addPassword.tooltip.passwords.bullet2", "Owner Password: Controls document permissions (not supported by all PDF viewers)")
        ]
      },
      {
        title: t("addPassword.tooltip.encryption.title", "Encryption Levels"),
        description: t("addPassword.tooltip.encryption.text", "Higher encryption levels provide better security but may not be supported by older PDF viewers."),
        bullets: [
          t("addPassword.tooltip.encryption.bullet1", "40-bit: Basic security, compatible with older viewers"),
          t("addPassword.tooltip.encryption.bullet2", "128-bit: Standard security, widely supported"),
          t("addPassword.tooltip.encryption.bullet3", "256-bit: Maximum security, requires modern viewers")
        ]
      },
    ]
  };
};
