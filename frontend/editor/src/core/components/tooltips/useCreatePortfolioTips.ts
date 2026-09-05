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
          "Bundles the selected files into a single Adobe PDF Portfolio (a PDF with a /Collection). Portfolio-aware viewers show the files as a browsable collection; other viewers see a cover page plus the files as attachments.",
        ),
      },
    ],
  };
};
