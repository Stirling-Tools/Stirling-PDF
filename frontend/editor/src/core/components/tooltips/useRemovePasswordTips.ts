import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const useRemovePasswordTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("encryptedPdfUnlock.removeOpening", "Remove opening password"),
    },
    tips: [
      {
        description: t(
          "encryptedPdfUnlock.removeOpeningHelp",
          "Requires the permissions password. The PDF will open without a password, while its restrictions remain.",
        ),
      },
    ],
  };
};
