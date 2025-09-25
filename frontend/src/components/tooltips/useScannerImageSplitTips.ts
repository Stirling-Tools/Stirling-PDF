import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useScannerImageSplitTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('scannerImageSplit.tooltip.title', 'Extract Individual Photos from Scans')
    },
    tips: [
      {
        title: t('scannerImageSplit.tooltip.overview.title', 'What This Tool Does'),
        description: t('scannerImageSplit.tooltip.overview.description',
          'This tool automatically detects and extracts individual photos from scanned documents or images. Perfect for digitising old photo albums, extracting multiple photos from scanner flatbed scans, or splitting composite images.'
        )
      },
      {
        title: t('scannerImageSplit.tooltip.commonUseCases', 'Common Use Cases'),
        bullets: [
          t('scannerImageSplit.tooltip.useCase1', 'Extracting multiple photos from a single flatbed scanner session'),
          t('scannerImageSplit.tooltip.useCase2', 'Splitting collages or composite images into individual photos'),
          t('scannerImageSplit.tooltip.useCase3', 'Digitising photo albums by scanning entire pages then extracting individual photos'),
          t('scannerImageSplit.tooltip.useCase4', 'Processing documents with embedded photos or images')
        ]
      },
      {
        title: t('scannerImageSplit.tooltip.problemSolving', 'Common Problems & Solutions'),
        bullets: [
          t('scannerImageSplit.tooltip.problem1', 'Photos not detected → Try increasing "Tolerance" to 30-50'),
          t('scannerImageSplit.tooltip.problem2', 'Too many false detections → Increase "Minimum Area" to 15000-20000'),
          t('scannerImageSplit.tooltip.problem3', 'Photos cropped too tight → Increase "Border Size" to 5-10'),
          t('scannerImageSplit.tooltip.problem4', 'Tilted photos not straightened → Lower "Angle Threshold" to 5'),
          t('scannerImageSplit.tooltip.problem5', 'Detecting dust/noise → Increase "Minimum Contour Area" to 1000')
        ]
      },
      {
        title: t('scannerImageSplit.tooltip.tips', 'Setup Tips for Best Results'),
        bullets: [
          t('scannerImageSplit.tooltip.tip1', 'Use white or light background behind photos'),
          t('scannerImageSplit.tooltip.tip2', 'Leave at least 1cm gap between photos'),
          t('scannerImageSplit.tooltip.tip3', 'Scan at 300+ DPI for better detection'),
          t('scannerImageSplit.tooltip.tip4', 'Clean scanner glass to avoid dust being detected as photos'),
          t('scannerImageSplit.tooltip.tip5', 'If it fails, try the default settings first before adjusting')
        ]
      }
    ]
  };
};