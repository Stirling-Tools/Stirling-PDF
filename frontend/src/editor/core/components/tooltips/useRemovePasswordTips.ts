import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useRemovePasswordTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("removePassword.title", "Remove Password"),
    },
    tips: [
      {
        description: t(
          "removePassword.selectiveHelp",
          "Enter the current password for each protection you want to remove. A blank field keeps that password. Removing the permissions password also removes action restrictions.",
        ),
      },
    ],
  };
};
