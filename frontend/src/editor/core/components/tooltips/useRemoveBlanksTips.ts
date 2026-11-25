import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useRemoveBlanksTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "removeBlanks.tooltip.header.title",
        "Remove Blank Pages Settings",
      ),
    },
    tips: [
      {
        title: t(
          "removeBlanks.tooltip.threshold.title",
          "Pixel Whiteness Threshold",
        ),
        description: t(
          "removeBlanks.tooltip.threshold.text",
          "Controls how white a pixel must be to count as white. A higher value accepts more shades, so more pages are treated as blank.",
        ),
        bullets: [
          t(
            "removeBlanks.tooltip.threshold.bullet1",
            "0 = only pure white counts (strictest, fewest pages removed)",
          ),
          t("removeBlanks.tooltip.threshold.bullet2", "128 = medium gray"),
          t(
            "removeBlanks.tooltip.threshold.bullet3",
            "255 = every pixel counts as white (removes almost every image page)",
          ),
        ],
      },
      {
        title: t(
          "removeBlanks.tooltip.whitePercent.title",
          "White Percentage Threshold",
        ),
        description: t(
          "removeBlanks.tooltip.whitePercent.text",
          "Sets the minimum percentage of white pixels required for a page to be considered blank and removed.",
        ),
      },
      {
        title: t(
          "removeBlanks.tooltip.includeBlankPages.title",
          "Include Detected Blank Pages",
        ),
        description: t(
          "removeBlanks.tooltip.includeBlankPages.text",
          "When enabled, creates a separate PDF containing all the blank pages that were detected and removed from the original document.",
        ),
      },
    ],
  };
};
