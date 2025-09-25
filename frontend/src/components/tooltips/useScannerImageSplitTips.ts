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
        title: t('scannerImageSplit.tooltip.angleThresholdTerm', 'Angle Threshold (10°)'),
        description: t('scannerImageSplit.tooltip.angleThresholdDef',
          'How much an image needs to be tilted before the tool tries to straighten it. Lower values detect smaller tilts.'
        )
      },
      {
        title: t('scannerImageSplit.tooltip.toleranceTerm', 'Tolerance (20)'),
        description: t('scannerImageSplit.tooltip.toleranceDef',
          'How similar background colours need to be to be considered the same. Higher values group more varied colours together.'
        )
      },
      {
        title: t('scannerImageSplit.tooltip.minAreaTerm', 'Minimum Area (8000)'),
        description: t('scannerImageSplit.tooltip.minAreaDef',
          'Smallest size (in pixels) for something to be considered a photo. Helps ignore small spots or artefacts.'
        )
      },
      {
        title: t('scannerImageSplit.tooltip.minContourAreaTerm', 'Minimum Contour Area (500)'),
        description: t('scannerImageSplit.tooltip.minContourAreaDef',
          'Minimum edge detection size. Helps distinguish actual photo edges from noise or texture.'
        )
      },
      {
        title: t('scannerImageSplit.tooltip.borderSizeTerm', 'Border Size (1)'),
        description: t('scannerImageSplit.tooltip.borderSizeDef',
          'Adds padding around detected photos to avoid cutting off edges. Increase if photos are getting cropped too tightly.'
        )
      },
      {
        title: t('scannerImageSplit.tooltip.tips', 'Tips for Best Results'),
        bullets: [
          t('scannerImageSplit.tooltip.tip1', 'Ensure good contrast between photos and background'),
          t('scannerImageSplit.tooltip.tip2', 'Place photos with some space between them on the scanner'),
          t('scannerImageSplit.tooltip.tip3', 'Use higher resolution scans for better edge detection'),
          t('scannerImageSplit.tooltip.tip4', 'Clean scanner glass to avoid dust spots being detected as photos'),
          t('scannerImageSplit.tooltip.tip5', 'For difficult images, try adjusting the tolerance and minimum area settings')
        ]
      }
    ]
  };
};