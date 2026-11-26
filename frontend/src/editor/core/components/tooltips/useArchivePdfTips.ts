import { useTranslation } from "react-i18next";
import { SidebarTooltipContent } from "@editor/types/tips";

export const useArchivePdfTips = (): SidebarTooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("archivePdf.tooltip.header.title", "About PDF/A"),
    },
    tips: [
      {
        description: t(
          "archivePdf.tooltip.description.text",
          "PDF/A is the standard for keeping documents readable for decades. Fonts and colours are built into the file so it opens the same way everywhere.",
        ),
      },
      {
        title: t("archivePdf.tooltip.version.title", "PDF/A version"),
        description: t(
          "archivePdf.tooltip.version.text",
          "Use the version your archive asks for. If it does not say, PDF/A-2b is the usual choice.",
        ),
        bullets: [
          t(
            "archivePdf.tooltip.version.bullet1",
            "PDF/A-1b: the oldest version, accepted almost everywhere",
          ),
          t(
            "archivePdf.tooltip.version.bullet2",
            "PDF/A-2b: suits most archives",
          ),
          t(
            "archivePdf.tooltip.version.bullet3",
            "PDF/A-3b: can also carry attached files, such as the data behind an e-invoice",
          ),
          t(
            "archivePdf.tooltip.version.bullet4",
            "Accessible versions: also tag the document so screen readers can follow it",
          ),
        ],
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
