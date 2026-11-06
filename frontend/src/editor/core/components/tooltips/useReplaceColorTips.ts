import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useReplaceColorTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "replaceColor.tooltip.header.title",
        "Replace & Invert Colour Settings Overview",
      ),
    },
    tips: [
      {
        description: t(
          "replaceColor.tooltip.description.text",
          "Transform PDF colours to improve readability and accessibility. Choose from high contrast presets, invert all colours, or create custom colour schemes.",
        ),
      },
      {
        title: t("replaceColor.tooltip.highContrast.title", "High Contrast"),
        description: t(
          "replaceColor.tooltip.highContrast.text",
          "Apply predefined high contrast colour combinations designed for better readability and accessibility compliance.",
        ),
      },
      {
        title: t("replaceColor.tooltip.invertAll.title", "Invert All Colours"),
        description: t(
          "replaceColor.tooltip.invertAll.text",
          "Completely invert all colours in the PDF, creating a negative-like effect. Useful for creating dark mode versions of documents or reducing eye strain in low-light conditions.",
        ),
      },
      {
        title: t("replaceColor.tooltip.custom.title", "Custom Colours"),
        description: t(
          "replaceColor.tooltip.custom.text",
          "Define your own text and background colours using the colour pickers. Perfect for creating branded documents or specific accessibility requirements.",
        ),
      },
      {
        title: t("replaceColor.tooltip.cmyk.title", "Convert to CMYK"),
        description: t(
          "replaceColor.tooltip.cmyk.text",
          "Convert the PDF from RGB colour space to CMYK colour space, optimized for professional printing. This process converts colours to the Cyan, Magenta, Yellow, Black model used by printers.",
        ),
      },
    ],
  };
};
