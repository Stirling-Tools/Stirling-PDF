import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const useCreatePortfolioTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("createPortfolio.tooltip.header.title", "About PDF Portfolios"),
    },
    tips: [
      {
        title: t("createPortfolio.tooltip.description.title", "What it does"),
        description: t(
          "createPortfolio.info",
          "Combines your files into one PDF that keeps each file whole inside it. Open the result to browse the files and view or save any of them on their own.",
        ),
      },
    ],
  };
};
