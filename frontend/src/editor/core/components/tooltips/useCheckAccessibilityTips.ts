import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useCheckAccessibilityTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "checkAccessibility.tooltip.header.title",
        "Which standard to check",
      ),
    },
    tips: [
      {
        title: t("checkAccessibility.tooltip.ua1.title", "PDF/UA-1"),
        description: t(
          "checkAccessibility.tooltip.ua1.text",
          "The first version of PDF/UA, published in 2012 as ISO 14289-1, for PDF 1.7 files.",
        ),
      },
      {
        title: t("checkAccessibility.tooltip.ua2.title", "PDF/UA-2"),
        description: t(
          "checkAccessibility.tooltip.ua2.text",
          "The newer version, published in 2024 as ISO 14289-2, for PDF 2.0 files. A PDF 1.7 file checked against it fails the rules that only apply to PDF 2.0.",
        ),
      },
    ],
  };
};
