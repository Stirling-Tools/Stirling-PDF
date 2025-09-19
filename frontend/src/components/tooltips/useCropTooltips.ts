import { useTranslation } from 'react-i18next';

export function useCropTooltips() {
  const { t } = useTranslation();

  return {
    header: {
      title: t("crop.tooltip.title", "How to Crop PDFs")
    },
    tips: [
      {
        description: t("crop.tooltip.description", "Select the area to crop from your PDF by dragging and resizing the blue overlay on the thumbnail."),
        bullets: [
          t("crop.tooltip.drag", "Drag the overlay to move the crop area"),
          t("crop.tooltip.resize", "Drag the corner and edge handles to resize"),
          t("crop.tooltip.precision", "Use coordinate inputs for precise positioning"),
        ]
      }
    ]
  };
}
