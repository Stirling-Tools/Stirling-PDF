import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useFlattenTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("flatten.tooltip.header.title", "About Flattening PDFs"),
    },
    tips: [
      {
        title: t(
          "flatten.tooltip.description.title",
          "What does flattening do?",
        ),
        description: t(
          "flatten.tooltip.description.text",
          "By default, Flatten renders every page as an image, so forms stop working and text is no longer selectable. Choose Flatten only forms to keep text, links, bookmarks and comments intact.",
        ),
      },
      {
        title: t(
          "flatten.tooltip.formsOnly.title",
          "What does 'Flatten only forms' mean?",
        ),
        description: t(
          "flatten.tooltip.formsOnly.text",
          "This option only removes the ability to fill in forms, but keeps other features working like clicking links, viewing bookmarks, and reading comments.",
        ),
      },
    ],
  };
};
