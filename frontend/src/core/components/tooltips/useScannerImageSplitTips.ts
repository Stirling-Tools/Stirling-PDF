import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useScannerImageSplitTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('scannerImageSplit.tooltip.title', 'Photo Splitter')
    },
    tips: [
      {
        title: t('scannerImageSplit.tooltip.whatThisDoes', 'What this does'),
        description: t('scannerImageSplit.tooltip.whatThisDoesDesc',
          'Automatically finds and extracts each photo from a scanned page or composite image—no manual cropping.'
        )
      },
      {
        title: t('scannerImageSplit.tooltip.whenToUse', 'When to use'),
        bullets: [
          t('scannerImageSplit.tooltip.useCase1', 'Scan whole album pages in one go'),
          t('scannerImageSplit.tooltip.useCase2', 'Split flatbed batches into separate files'),
          t('scannerImageSplit.tooltip.useCase3', 'Break collages into individual photos'),
          t('scannerImageSplit.tooltip.useCase4', 'Pull photos from documents')
        ]
      },
      {
        title: t('scannerImageSplit.tooltip.quickFixes', 'Quick fixes'),
        bullets: [
          t('scannerImageSplit.tooltip.problem1', 'Photos not detected → increase Tolerance to 30–50'),
          t('scannerImageSplit.tooltip.problem2', 'Too many false detections → increase Minimum Area to 15,000–20,000'),
          t('scannerImageSplit.tooltip.problem3', 'Crops are too tight → increase Border Size to 5–10'),
          t('scannerImageSplit.tooltip.problem4', 'Tilted photos not straightened → lower Angle Threshold to ~5°'),
          t('scannerImageSplit.tooltip.problem5', 'Dust/noise boxes → increase Minimum Contour Area to 1000–2000')
        ]
      },
      {
        title: t('scannerImageSplit.tooltip.setupTips', 'Setup tips'),
        bullets: [
          t('scannerImageSplit.tooltip.tip1', 'Use a plain, light background'),
          t('scannerImageSplit.tooltip.tip2', 'Leave a small gap (≈1 cm) between photos'),
          t('scannerImageSplit.tooltip.tip3', 'Scan at 300–600 DPI'),
          t('scannerImageSplit.tooltip.tip4', 'Clean the scanner glass')
        ]
      },
      {
        title: t('scannerImageSplit.tooltip.headsUp', 'Heads-up'),
        description: t('scannerImageSplit.tooltip.headsUpDesc',
          'Overlapping photos or backgrounds very close in colour to the photos can reduce accuracy—try a lighter or darker background and leave more space.'
        )
      }
    ]
  };
};