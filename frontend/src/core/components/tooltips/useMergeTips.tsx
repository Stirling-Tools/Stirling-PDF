import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const useMergeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("merge.tooltip.header.title", "Merge Settings Overview"),
    },
    tips: [
      {
        title: t(
          "merge.removeDigitalSignature.tooltip.title",
          "Remove Digital Signature",
        ),
        description: t(
          "merge.removeDigitalSignature.tooltip.description",
          "Digital signatures will be invalidated when merging files. Check this to remove them from the final merged PDF.",
        ),
      },
      {
        title: t(
          "merge.generateTableOfContents.tooltip.title",
          "Generate Table of Contents",
        ),
        description: t(
          "merge.generateTableOfContents.tooltip.description",
          "Automatically creates a clickable table of contents in the merged PDF based on the original file names and page numbers.",
        ),
      },
      {
        title: t(
          "merge.preserveAccessibility.tooltip.title",
          "Preserve Accessibility Tags",
        ),
        description: t(
          "merge.preserveAccessibility.tooltip.description",
          "Keeps PDF/UA structure tags (used by screen readers) in the merged output. Increases peak memory usage; leave off for large merges if accessibility is not required.",
        ),
      },
    ],
  };
};
