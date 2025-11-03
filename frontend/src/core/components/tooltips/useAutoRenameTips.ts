import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAutoRenameTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("auto-rename.tooltip.header.title", "How Auto-Rename Works")
    },
    tips: [
      {
        title: t("auto-rename.tooltip.howItWorks.title", "Smart Renaming"),
        bullets: [
          t("auto-rename.tooltip.howItWorks.bullet1", "Looks for text that appears to be a title or heading"),
          t("auto-rename.tooltip.howItWorks.bullet2", "Creates a clean, valid filename from the detected title"),
          t("auto-rename.tooltip.howItWorks.bullet3", "Keeps the original name if no suitable title is found")
        ]
      }
    ]
  };
};
