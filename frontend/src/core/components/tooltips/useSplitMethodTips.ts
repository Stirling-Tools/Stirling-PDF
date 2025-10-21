import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useSplitMethodTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("split.methodSelection.tooltip.title", "Choose Your Split Method")
    },
    tips: [
      {
        title: t("split.methodSelection.tooltip.header.title", "Split Method Selection"),
        description: t("split.methodSelection.tooltip.header.text", "Choose how you want to split your PDF document. Each method is optimized for different use cases and document types."),
        bullets: [
          t("split.methodSelection.tooltip.bullet1", "Click on a method card to select it"),
          t("split.methodSelection.tooltip.bullet2", "Hover over each card to see a quick description"),
          t("split.methodSelection.tooltip.bullet3", "The settings step will appear after you select a method"),
          t("split.methodSelection.tooltip.bullet4", "You can change methods at any time before processing")
        ]
      }
    ]
  };
};