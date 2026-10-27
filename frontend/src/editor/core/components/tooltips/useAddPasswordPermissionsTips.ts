import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useAddPasswordPermissionsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("addPassword.tooltip.permissions.title", "Change Permissions"),
    },
    tips: [
      {
        description: t(
          "addPassword.tooltip.permissions.text",
          "Choose which actions to restrict. A separate permissions password is required to change these restrictions.",
        ),
      },
    ],
  };
};
