import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const usePageLayoutAdvancedTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "pageLayout.advanced.tooltip.header.title",
        "Advanced Layout Options",
      ),
    },
    tips: [
      {
        title: t(
          "pageLayout.advanced.tooltip.orientation.title",
          "Orientation",
        ),
        description: t(
          "pageLayout.advanced.tooltip.orientation.text",
          "Choose the final sheet direction. Portrait works better for tall content, while landscape fits wider layouts.",
        ),
      },
      {
        title: t(
          "pageLayout.advanced.tooltip.arrangement.title",
          "Page Arrangement",
        ),
        description: t(
          "pageLayout.advanced.tooltip.arrangement.text",
          "Controls whether pages fill the grid row-by-row or column-by-column.",
        ),
        bullets: [
          t(
            "pageLayout.advanced.tooltip.arrangement.bullet1",
            "By Rows: Fill each row first.",
          ),
          t(
            "pageLayout.advanced.tooltip.arrangement.bullet2",
            "By Columns: Fill each column first.",
          ),
        ],
      },
      {
        title: t(
          "pageLayout.advanced.tooltip.readingDirection.title",
          "Reading Direction",
        ),
        description: t(
          "pageLayout.advanced.tooltip.readingDirection.text",
          "Sets horizontal ordering in the grid, useful for left-to-right and right-to-left document conventions.",
        ),
        bullets: [
          t(
            "pageLayout.advanced.tooltip.readingDirection.bullet1",
            "LTR: Left to right order.",
          ),
          t(
            "pageLayout.advanced.tooltip.readingDirection.bullet2",
            "RTL: Right to left order.",
          ),
        ],
      },
    ],
  };
};
