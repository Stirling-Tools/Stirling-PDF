import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useRemoveBlanksTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("removeBlanks.tooltip.header.title", "Remove Blank Pages Settings"),
    },
    tips: [
      {
        title: t("removeBlanks.tooltip.threshold.title", "Pixel Whiteness Threshold"),
        description: t("removeBlanks.tooltip.threshold.text", "Controls how white a pixel must be to be considered 'white'. This helps determine what counts as a blank area on the page."),
        bullets: [
          t("removeBlanks.tooltip.threshold.bullet1", "0 = Pure black (most restrictive)"),
          t("removeBlanks.tooltip.threshold.bullet2", "128 = Medium gray"),
          t("removeBlanks.tooltip.threshold.bullet3", "255 = Pure white (least restrictive)")
        ]
      },
      {
        title: t("removeBlanks.tooltip.whitePercent.title", "White Percentage Threshold"),
        description: t("removeBlanks.tooltip.whitePercent.text", "Sets the minimum percentage of white pixels required for a page to be considered blank and removed."),
        bullets: [
          t("removeBlanks.tooltip.whitePercent.bullet1", "Lower values (e.g., 80%) = More pages removed"),
          t("removeBlanks.tooltip.whitePercent.bullet2", "Higher values (e.g., 95%) = Only very blank pages removed"),
          t("removeBlanks.tooltip.whitePercent.bullet3", "Use higher values for documents with light backgrounds")
        ]
      },
      {
        title: t("removeBlanks.tooltip.includeBlankPages.title", "Include Detected Blank Pages"),
        description: t("removeBlanks.tooltip.includeBlankPages.text", "When enabled, creates a separate PDF containing all the blank pages that were detected and removed from the original document."),
        bullets: [
          t("removeBlanks.tooltip.includeBlankPages.bullet1", "Useful for reviewing what was removed"),
          t("removeBlanks.tooltip.includeBlankPages.bullet2", "Helps verify the detection accuracy"),
          t("removeBlanks.tooltip.includeBlankPages.bullet3", "Can be disabled to reduce output file size")
        ]
      }
    ]
  };
};
