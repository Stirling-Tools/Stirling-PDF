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
          "Removes only the opening password. Use Create an unprotected copy to remove passwords and restrictions.",
        ),
      },
    ],
  };
};
