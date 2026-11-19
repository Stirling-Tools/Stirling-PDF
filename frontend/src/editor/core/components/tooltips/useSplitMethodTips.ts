import { useTranslation } from "react-i18next";
import { SidebarTooltipContent } from "@editor/types/tips";

export const useSplitMethodTips = (): SidebarTooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "split.methodSelection.tooltip.title",
        "Choose Your Split Method",
      ),
    },
    tips: [
      {
        title: t(
          "split.methodSelection.tooltip.header.title",
          "Split Method Selection",
        ),
        description: t(
          "split.methodSelection.tooltip.header.text",
          "Choose how you want to split your PDF document. Each method is optimized for different use cases and document types.",
        ),
      },
    ],
  };
};
