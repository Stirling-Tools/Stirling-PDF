import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useRotateTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("rotate.tooltip.header.title", "Rotate Settings Overview"),
    },
    tips: [
      {
        description: t("rotate.tooltip.description.text", "Rotate your PDF pages clockwise or anticlockwise in 90-degree increments. All pages in the PDF will be rotated. The preview shows how your document will look after rotation."),
      },
      {
        title: t("rotate.tooltip.controls.title", "Controls"),
        description: t("rotate.tooltip.controls.text", "Use the rotation buttons to adjust orientation. Left button rotates anticlockwise, right button rotates clockwise. Each click rotates by 90 degrees."),
      },
    ],
  };
};
