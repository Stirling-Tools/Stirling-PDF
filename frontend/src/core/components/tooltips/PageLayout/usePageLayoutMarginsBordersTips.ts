import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const usePageLayoutMarginsBordersTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "pageLayout.marginsBorders.tooltip.header.title",
        "Margins and Borders",
      ),
    },
    tips: [
      {
        title: t("pageLayout.marginsBorders.tooltip.margins.title", "Margins"),
        description: t(
          "pageLayout.marginsBorders.tooltip.margins.text",
          "Use top, bottom, left, and right margins to control spacing around the full sheet output.",
        ),
      },
      {
        title: t(
          "pageLayout.marginsBorders.tooltip.innerMargin.title",
          "Inner Margin",
        ),
        description: t(
          "pageLayout.marginsBorders.tooltip.innerMargin.text",
          "Inner margin adds spacing between cells in the page grid to improve separation and readability.",
        ),
      },
      {
        title: t(
          "pageLayout.marginsBorders.tooltip.borders.title",
          "Add Borders",
        ),
        description: t(
          "pageLayout.marginsBorders.tooltip.borders.text",
          "Enable borders to draw lines around each placed page. This can help visual separation or trimming.",
        ),
      },
      {
        title: t(
          "pageLayout.marginsBorders.tooltip.borderWidth.title",
          "Border Thickness",
        ),
        description: t(
          "pageLayout.marginsBorders.tooltip.borderWidth.text",
          "Border thickness is only applied when borders are enabled. Higher values produce thicker lines.",
        ),
      },
    ],
  };
};
