import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

/**
 * Reusable tooltip for page selection functionality.
 * Can be used by any tool that uses the GeneralUtils.parsePageList syntax.
 */
export const usePageSelectionTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("pageSelection.tooltip.header.title", "Page Selection Guide")
    },
    tips: [
      {
        description: t("pageSelection.tooltip.description", "Choose which pages to use for the operation. Supports single pages, ranges, formulas, and the all keyword.")
      },
      {
        title: t("pageSelection.tooltip.individual.title", "Individual Pages"),
        description: t("pageSelection.tooltip.individual.description", "Enter numbers separated by commas."),
        bullets: [
          t("pageSelection.tooltip.individual.bullet1", "<strong>1,3,5</strong> → selects pages 1, 3, 5"),
          t("pageSelection.tooltip.individual.bullet2", "<strong>2,7,12</strong> → selects pages 2, 7, 12")
        ]
      },
      {
        title: t("pageSelection.tooltip.ranges.title", "Page Ranges"),
        description: t("pageSelection.tooltip.ranges.description", "Use - for consecutive pages."),
        bullets: [
          t("pageSelection.tooltip.ranges.bullet1", "<strong>3-6</strong> → selects pages 3–6"),
          t("pageSelection.tooltip.ranges.bullet2", "<strong>10-15</strong> → selects pages 10–15"),
          t("pageSelection.tooltip.ranges.bullet3", "<strong>5-</strong> → selects pages 5 to end")
        ]
      },
      {
        title: t("pageSelection.tooltip.mathematical.title", "Mathematical Functions"),
        description: t("pageSelection.tooltip.mathematical.description", "Use n in formulas for patterns."),
        bullets: [
		  t("pageSelection.tooltip.mathematical.bullet2", "<strong>2n-1</strong> → all odd pages (1, 3, 5…)"),
          t("pageSelection.tooltip.mathematical.bullet1", "<strong>2n</strong> → all even pages (2, 4, 6…)"),
          t("pageSelection.tooltip.mathematical.bullet3", "<strong>3n</strong> → every 3rd page (3, 6, 9…)"),
          t("pageSelection.tooltip.mathematical.bullet4", "<strong>4n-1</strong> → pages 3, 7, 11, 15…")
        ]
      },
      {
        title: t("pageSelection.tooltip.special.title", "Special Keywords"),
        bullets: [
          t("pageSelection.tooltip.special.bullet1", "<strong>all</strong> → selects all pages"),
        ]
      },
      {
        title: t("pageSelection.tooltip.complex.title", "Complex Combinations"),
        description: t("pageSelection.tooltip.complex.description", "Mix different types."),
        bullets: [
          t("pageSelection.tooltip.complex.bullet1", "<strong>1,3-5,8,2n</strong> → pages 1, 3–5, 8, plus evens"),
          t("pageSelection.tooltip.complex.bullet2", "<strong>10-,2n-1</strong> → from page 10 to end + odd pages")
        ]
      }
    ]
  };
};