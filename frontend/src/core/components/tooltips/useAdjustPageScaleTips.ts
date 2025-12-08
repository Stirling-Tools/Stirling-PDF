import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useAdjustPageScaleTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("adjustPageScale.tooltip.header.title", "Page Scale Settings Overview")
    },
    tips: [
      {
        title: t("adjustPageScale.tooltip.description.title", "Description"),
        description: t("adjustPageScale.tooltip.description.text", "Adjust the size of PDF content and change the page dimensions.")
      },
      {
        title: t("adjustPageScale.tooltip.scaleFactor.title", "Scale Factor"),
        description: t("adjustPageScale.tooltip.scaleFactor.text", "Controls how large or small the content appears on the page. Content is scaled and centered - if scaled content is larger than the page size, it may be cropped."),
        bullets: [
          t("adjustPageScale.tooltip.scaleFactor.bullet1", "1.0 = Original size"),
          t("adjustPageScale.tooltip.scaleFactor.bullet2", "0.5 = Half size (50% smaller)"),
          t("adjustPageScale.tooltip.scaleFactor.bullet3", "2.0 = Double size (200% larger, may crop)")
        ]
      },
      {
        title: t("adjustPageScale.tooltip.pageSize.title", "Target Page Size"),
        description: t("adjustPageScale.tooltip.pageSize.text", "Sets the dimensions of the output PDF pages. 'Keep Original Size' maintains current dimensions, while other options resize to standard paper sizes.")
      }
    ]
  };
};
