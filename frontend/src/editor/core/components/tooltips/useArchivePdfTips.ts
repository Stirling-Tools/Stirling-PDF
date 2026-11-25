import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useArchivePdfTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("archivePdf.tooltip.header.title", "Archive PDF (PDF/A)"),
    },
    tips: [
      {
        description: t(
          "archivePdf.tooltip.description.text",
          "Converts your PDF to PDF/A, the standard for keeping documents readable for decades. Fonts and colours are built into the file so it opens the same way everywhere.",
        ),
      },
      {
        title: t("archivePdf.tooltip.outputFormat.title", "PDF/A version"),
        description: t(
          "archivePdf.tooltip.outputFormat.text",
          "PDF/A-2b suits most archives. PDF/A-1b is the oldest and most widely accepted. PDF/A-3b also allows other files to be attached, such as the data behind an e-invoice. The accessible versions also tag the document so screen readers can follow it.",
        ),
      },
      {
        title: t("archivePdf.tooltip.strict.title", "Strict mode"),
        description: t(
          "archivePdf.tooltip.strict.text",
          "Checks the result against the standard and fails instead of returning a file that does not fully comply.",
        ),
      },
    ],
  };
};
