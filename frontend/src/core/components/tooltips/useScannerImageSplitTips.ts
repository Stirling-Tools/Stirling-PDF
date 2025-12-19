import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useScannerImageSplitTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("scannerImageSplit.help.title", "Advanced OpenCV Parameters")
    },
    tips: [
      {
        title: t("scannerImageSplit.help.overview", "Overview"),
        description: t("scannerImageSplit.help.overview", "This tool uses OpenCV (computer vision library) to automatically detect individual photos on scanned pages.")
      },
      {
        title: t("scannerImageSplit.help.angleThreshold", "Angle Threshold (Default: 5)"),
        description: t("scannerImageSplit.help.angleThresholdDesc", "Rotation angle in degrees needed before auto-straightening a photo. Lower values (1-3) straighten more aggressively, higher values (10-15) only straighten very tilted photos.")
      },
      {
        title: t("scannerImageSplit.help.tolerance", "Tolerance (Default: 20)"),
        description: t("scannerImageSplit.help.toleranceDesc", "How closely a color must match the page background to count as background. Higher values (30-50) detect photos more easily but may include background noise. Lower values (10-15) are stricter.")
      },
      {
        title: t("scannerImageSplit.help.minArea", "Minimum Area (Default: 8000)"),
        description: t("scannerImageSplit.help.minAreaDesc", "Smallest photo size in pixels² to keep. Increase to 15,000-20,000 to filter out small fragments. Decrease to 3000-5000 to detect smaller photos.")
      },
      {
        title: t("scannerImageSplit.help.minContourArea", "Minimum Contour Area (Default: 500)"),
        description: t("scannerImageSplit.help.minContourAreaDesc", "Smallest edge/shape size when detecting photo boundaries. Increase to 1000-2000 to filter out dust and specks. Lower values detect finer edges.")
      },
      {
        title: t("scannerImageSplit.help.borderSize", "Border Size (Default: 1)"),
        description: t("scannerImageSplit.help.borderSizeDesc", "Extra padding in pixels around each extracted photo. Increase to 5-10 to avoid cutting edges. Set to 0 for no padding.")
      },
      {
        title: t("scannerImageSplit.help.recommendedSettings", "Recommended Settings"),
        description: "",
        bullets: [
          t("scannerImageSplit.help.normalScans", "Normal photo scans: Use defaults (Angle: 5, Tolerance: 20, Min Area: 8000)"),
          t("scannerImageSplit.help.highQuality", "High-quality photos on clean background: Tolerance 15, Min Area 10000, Border 3"),
          t("scannerImageSplit.help.noisyScans", "Noisy/dirty scans: Tolerance 30, Min Contour Area 1500, Border 5"),
          t("scannerImageSplit.help.smallPhotos", "Small photos (ID cards, stamps): Min Area 3000, Border 2")
        ]
      }
    ]
  };
};
