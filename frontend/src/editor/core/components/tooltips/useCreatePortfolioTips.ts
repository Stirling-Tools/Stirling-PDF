import { useTranslation } from "react-i18next";
import { SidebarTooltipContent } from "@editor/types/tips";

export const useCreatePortfolioTips = (): SidebarTooltipContent => {
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
      {
        title: t("createPortfolio.tooltip.olderReaders.title", "Older readers"),
        description: t(
          "createPortfolio.description",
          "Every selected file is kept whole inside the new PDF, whatever its type. Readers that don't support portfolios show a cover page with the files attached.",
        ),
      },
    ],
  };
};
