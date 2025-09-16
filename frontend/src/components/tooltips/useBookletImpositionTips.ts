import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useBookletImpositionTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("bookletImposition.tooltip.title", "Booklet Imposition Guide")
    },
    tips: [
      {
        title: t("bookletImposition.tooltip.overview.title", "What is Booklet Imposition?"),
        description: t("bookletImposition.tooltip.overview.description", "Arranges PDF pages in the correct order for booklet printing. Pages are reordered so that when printed and folded, they appear in sequence."),
        bullets: [
          t("bookletImposition.tooltip.overview.bullet1", "Creates printable booklets from regular PDFs"),
          t("bookletImposition.tooltip.overview.bullet2", "Handles page ordering for folding"),
          t("bookletImposition.tooltip.overview.bullet3", "Supports saddle-stitch and side-stitch binding")
        ]
      },
      {
        title: t("bookletImposition.tooltip.bookletTypes.title", "Booklet Types"),
        bullets: [
          t("bookletImposition.tooltip.bookletTypes.standard", "Standard: Saddle-stitched binding (staples along fold)"),
          t("bookletImposition.tooltip.bookletTypes.sideStitch", "Side-Stitch: Binding along edge (spiral, ring, perfect)")
        ]
      },
      {
        title: t("bookletImposition.tooltip.pagesPerSheet.title", "Pages Per Sheet"),
        bullets: [
          t("bookletImposition.tooltip.pagesPerSheet.two", "2 Pages: Standard layout (most common)"),
          t("bookletImposition.tooltip.pagesPerSheet.four", "4 Pages: Compact layout")
        ]
      },
      {
        title: t("bookletImposition.tooltip.orientation.title", "Page Orientation"),
        bullets: [
          t("bookletImposition.tooltip.orientation.landscape", "Landscape: A4 → A5 booklet (recommended)"),
          t("bookletImposition.tooltip.orientation.portrait", "Portrait: A4 → A6 booklet (compact)")
        ]
      }
    ]
  };
};