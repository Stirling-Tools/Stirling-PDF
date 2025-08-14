import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useCompressTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("compress.tooltip.header.title", "Compress Settings Overview")
    },
    tips: [
      {
        title: t("compress.tooltip.description.title", "Description"),
        description: t("compress.tooltip.description.text", "Compression is an easy way to reduce your file size. Pick File Size to enter a target size and have us adjust quality for you. Pick Quality to set compression strength manually.")
      },
      {
        title: t("compress.tooltip.qualityAdjustment.title", "Quality Adjustment"),
        description: t("compress.tooltip.qualityAdjustment.text", "Drag the slider to adjust the compression strength. Lower values (1-3) preserve quality but result in larger files. Higher values (7-9) shrink the file more but reduce image clarity."),
        bullets: [
          t("compress.tooltip.qualityAdjustment.bullet1", "Lower values preserve quality"),
          t("compress.tooltip.qualityAdjustment.bullet2", "Higher values reduce file size")
        ]
      },
      {
        title: t("compress.tooltip.grayscale.title", "Grayscale"),
        description: t("compress.tooltip.grayscale.text", "Select this option to convert all images to black and white, which can significantly reduce file size especially for scanned PDFs or image-heavy documents.")
      }
    ]
  };
};
