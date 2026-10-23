import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";
import { usePageSelectionTips } from "@editor/components/tooltips/usePageSelectionTips";

export const useExtractPagesTips = (): TooltipContent => {
  const { t } = useTranslation();
  const base = usePageSelectionTips();

  return {
    header: base.header,
    tips: [
      {
        description: t(
          "extractPages.tooltip.description",
          "Extracts the selected pages into a new PDF, preserving order.",
        ),
      },
      ...(base.tips || []),
    ],
  };
};

export default useExtractPagesTips;
