import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useWetSignatureTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('wetSignature.tooltip.header', 'Signature Creation Methods'),
    },
    tips: [
      {
        title: t('wetSignature.tooltip.draw.title', 'Draw Signature'),
        description: t(
          'wetSignature.tooltip.draw.description',
          'Create a handwritten signature using your mouse or touchscreen. Best for personal, authentic signatures.'
        ),
        bullets: [
          t('wetSignature.tooltip.draw.bullet1', 'Customize pen color and thickness'),
          t('wetSignature.tooltip.draw.bullet2', 'Clear and redraw until satisfied'),
          t('wetSignature.tooltip.draw.bullet3', 'Works on touch devices (tablets, phones)'),
        ],
      },
      {
        title: t('wetSignature.tooltip.upload.title', 'Upload Signature Image'),
        description: t(
          'wetSignature.tooltip.upload.description',
          'Upload a pre-created signature image. Ideal if you have a scanned signature or company logo.'
        ),
        bullets: [
          t('wetSignature.tooltip.upload.bullet1', 'Supports PNG, JPG, and other image formats'),
          t('wetSignature.tooltip.upload.bullet2', 'Transparent backgrounds recommended for best results'),
          t('wetSignature.tooltip.upload.bullet3', 'Image will be resized to fit signature area'),
        ],
      },
      {
        title: t('wetSignature.tooltip.type.title', 'Type Signature'),
        description: t(
          'wetSignature.tooltip.type.description',
          'Generate a signature from typed text. Fast and consistent, suitable for business documents.'
        ),
        bullets: [
          t('wetSignature.tooltip.type.bullet1', 'Choose from multiple fonts'),
          t('wetSignature.tooltip.type.bullet2', 'Customize text size and color'),
          t('wetSignature.tooltip.type.bullet3', 'Perfect for standardized signatures'),
        ],
      },
    ],
  };
};
