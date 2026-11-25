import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useCompressTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("compress.tooltip.header.title", "Compress Settings Overview"),
    },
    tips: [
      {
        description: t(
          "compress.tooltip.description.text",
          "Compression is an easy way to reduce your file size. Pick File Size to enter a target size and have us adjust quality for you. Pick Quality to set compression strength manually.",
        ),
      },
      {
        title: t(
          "compress.tooltip.qualityAdjustment.title",
          "Quality Adjustment",
        ),
        description: t(
          "compress.tooltip.qualityAdjustment.text",
          "Drag the slider to adjust the compression strength. Lower values (1-3) preserve quality but result in larger files. Higher values (7-9) shrink the file more but reduce image clarity.",
        ),
      },
      {
        title: t("compress.tooltip.imageOptions.title", "Image options"),
        description: t(
          "compress.tooltip.imageOptions.text",
          "Grayscale converts images to grey, which can significantly reduce the size of scanned or image-heavy documents. Line Art uses ImageMagick for high-contrast black and white; Detail controls how much becomes black, and Edge emphasis controls edge detection.",
        ),
      },
      {
        title: t(
          "compress.tooltip.linearize.title",
          "Linearize for fast web viewing",
        ),
        description: t(
          "compress.tooltip.linearize.text",
          "Reorganises the PDF so a browser can render the first page before downloading the whole file. It improves loading speed but does not change how the pages look.",
        ),
      },
    ],
  };
};
