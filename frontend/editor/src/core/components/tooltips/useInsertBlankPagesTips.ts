import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const useInsertBlankPagesTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("insertBlankPages.tooltip.title", "Insert Blank Pages"),
      description: t(
        "insertBlankPages.tooltip.description",
        "Add blank pages at a specific position in your PDF document.",
      ),
    },
    tips: [
      {
        description: t(
          "insertBlankPages.tooltip.position",
          "Specify the page number after which to insert blank pages (0 for the beginning).",
        ),
      },
      {
        description: t(
          "insertBlankPages.tooltip.count",
          "Choose how many blank pages to insert (up to 100).",
        ),
      },
      {
        description: t(
          "insertBlankPages.tooltip.pageSize",
          "Select the page size for the blank pages (A4, Letter, Legal, etc.).",
        ),
      },
    ],
  };
};

export default useInsertBlankPagesTips;
