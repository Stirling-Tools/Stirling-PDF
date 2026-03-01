import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const usePageLayoutTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("pageLayout.tooltip.header.title", "Page Layout Guide")
    },
    tips: [
      {
        title: t("pageLayout.tooltip.overview.title", "What is Page Layout?"),
        description: t("pageLayout.tooltip.overview.text", "Fit multiple pages onto a single sheet for handouts or to save paper.")
      },
      {
        title: t("pageLayout.tooltip.mode.title", "Mode"),
        description: t("pageLayout.tooltip.mode.text", "Choose how the grid is configured:"),
        bullets: [
          t("pageLayout.tooltip.mode.bullet1", "Default: Pick a preset and the grid is calculated automatically."),
          t("pageLayout.tooltip.mode.bullet2", "Custom: Set rows and columns manually.")
        ]
      },
      {
        title: t("pageLayout.tooltip.pagesPerSheet.title", "Pages per Sheet (Default Mode)"),
        description: t("pageLayout.tooltip.pagesPerSheet.text", "Choose how many pages per sheet (e.g. 4 → 2×2, 9 → 3×3).")
      },
      {
        title: t("pageLayout.tooltip.rowsCols.title", "Rows & Columns (Custom Mode)"),
        description: t("pageLayout.tooltip.rowsCols.text", "Set exact grid dimensions. Total pages per sheet = rows × columns.")
      },
      {
        title: t("pageLayout.tooltip.orientation.title", "Orientation"),
        description: t("pageLayout.tooltip.orientation.text", "Sets the output sheet orientation:"),
        bullets: [
          t("pageLayout.tooltip.orientation.bullet1", "Portrait: Taller than wide."),
          t("pageLayout.tooltip.orientation.bullet2", "Landscape: Wider than tall.")
        ]
      },
      {
        title: t("pageLayout.tooltip.arrangement.title", "Page Arrangement"),
        description: t("pageLayout.tooltip.arrangement.text", "Controls the order pages fill the grid:"),
        bullets: [
          t("pageLayout.tooltip.arrangement.bullet1", "By Rows: Fill row by row (left-to-right or right-to-left)."),
          t("pageLayout.tooltip.arrangement.bullet2", "By Columns: Fill top-to-bottom, column by column.")
        ]
      },
      {
        title: t("pageLayout.tooltip.readingDirection.title", "Reading Direction"),
        description: t("pageLayout.tooltip.readingDirection.text", "Controls the horizontal order of pages:"),
        bullets: [
          t("pageLayout.tooltip.readingDirection.bullet1", "LTR: Left to right."),
          t("pageLayout.tooltip.readingDirection.bullet2", "RTL: Right to left.")
        ]
      },
      {
        title: t("pageLayout.tooltip.addBorder.title", "Add Borders"),
        description: t("pageLayout.tooltip.addBorder.text", "Draws border lines around each page cell for cutting guides or visual separation.")
      }
    ]
  };
};
