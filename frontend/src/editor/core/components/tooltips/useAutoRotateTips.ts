import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useAutoRotateTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("autoRotate.tooltip.header.title", "Auto Rotate"),
    },
    tips: [
      {
        description: t(
          "autoRotate.tooltip.description.text",
          "Works out which way up each page should be and turns it the right way round. Pages that are already upright are left alone.",
        ),
      },
      {
        title: t("autoRotate.tooltip.detectionMode.title", "Detection method"),
        description: t(
          "autoRotate.tooltip.detectionMode.text",
          "Auto reads the text on the page first, then looks at the page as an image if that is not enough. Text only skips the image check, which is quickest for documents that were never scanned. OCR only treats every page as an image.",
        ),
      },
      {
        title: t(
          "autoRotate.tooltip.confidenceThreshold.title",
          "Confidence threshold",
        ),
        description: t(
          "autoRotate.tooltip.confidenceThreshold.text",
          "How certain the check has to be before a page is turned. Lower it to rotate more pages, raise it to leave more pages untouched.",
        ),
      },
      {
        title: t(
          "autoRotate.tooltip.inferUndetected.title",
          "Rotate low confidence pages to match",
        ),
        description: t(
          "autoRotate.tooltip.inferUndetected.text",
          "Blank or nearly blank pages cannot be checked on their own. When every page that could be read needs the same turn, these pages are turned to match them.",
        ),
      },
    ],
  };
};
