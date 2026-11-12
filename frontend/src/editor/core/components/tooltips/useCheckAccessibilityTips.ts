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
          "The established standard, and the one most organisations and checklists ask for. Choose this if you're not sure.",
        ),
      },
      {
        title: t("checkAccessibility.tooltip.ua2.title", "PDF/UA-2"),
        description: t(
          "checkAccessibility.tooltip.ua2.text",
          "The newer standard, for PDF 2.0 files. Choose it if your file is PDF 2.0 or someone has asked for PDF/UA-2: a PDF 1.7 file checked against it fails rules that only apply to PDF 2.0.",
        ),
      },
    ],
  };
};
