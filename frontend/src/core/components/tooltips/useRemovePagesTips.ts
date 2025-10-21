import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useRemovePagesTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("removePages.tooltip.header.title", "Remove Pages Settings"),
    },
    tips: [
      {
        title: t("removePages.tooltip.pageNumbers.title", "Page Selection"),
        description: t("removePages.tooltip.pageNumbers.text", "Specify which pages to remove from your PDF. You can select individual pages, ranges, or use mathematical expressions."),
        bullets: [
          t("removePages.tooltip.pageNumbers.bullet1", "Individual pages: 1,3,5 (removes pages 1, 3, and 5)"),
          t("removePages.tooltip.pageNumbers.bullet2", "Page ranges: 1-5,10-15 (removes pages 1-5 and 10-15)"),
          t("removePages.tooltip.pageNumbers.bullet3", "Mathematical: 2n+1 (removes odd pages)"),
          t("removePages.tooltip.pageNumbers.bullet4", "Open ranges: 5- (removes from page 5 to end)")
        ]
      },
      {
        title: t("removePages.tooltip.examples.title", "Common Examples"),
        description: t("removePages.tooltip.examples.text", "Here are some common page selection patterns:"),
        bullets: [
          t("removePages.tooltip.examples.bullet1", "Remove first page: 1"),
          t("removePages.tooltip.examples.bullet2", "Remove last 3 pages: -3"),
          t("removePages.tooltip.examples.bullet3", "Remove every other page: 2n"),
          t("removePages.tooltip.examples.bullet4", "Remove specific scattered pages: 1,5,10,15")
        ]
      }
    ]
  };
};
