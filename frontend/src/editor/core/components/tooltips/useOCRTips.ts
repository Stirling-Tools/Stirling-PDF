import { useTranslation } from "react-i18next";
import { TooltipContent } from "@editor/types/tips";

export const useOCRTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("ocr.tooltip.header.title", "OCR Settings Overview"),
    },
    tips: [
      {
        title: t("ocr.tooltip.mode.title", "OCR Mode"),
        description: t(
          "ocr.tooltip.mode.text",
          "Optical Character Recognition (OCR) helps you turn scanned or screenshotted pages into text you can search, copy, or highlight.",
        ),
        bullets: [
          t(
            "ocr.tooltip.mode.bullet1",
            "Auto skips pages that already contain text layers.",
          ),
          t(
            "ocr.tooltip.mode.bullet2",
            "Force re-OCRs every page and replaces all the text.",
          ),
          t(
            "ocr.tooltip.mode.bullet3",
            "Strict halts if any selectable text is found.",
          ),
        ],
      },
      {
        title: t("ocr.tooltip.languages.title", "Languages"),
        description: t(
          "ocr.tooltip.languages.text",
          "Improve OCR accuracy by specifying the expected languages. Choose one or more languages to guide detection.",
        ),
      },
      {
        title: t("ocr.tooltip.output.title", "Output"),
        description: t(
          "ocr.tooltip.output.summary",
          "OCR always returns a searchable PDF with the recognised text behind the original page image.",
        ),
        bullets: [
          t(
            "ocr.tooltip.output.textFile",
            "Enable Create a text file in Advanced to also get a .txt sidecar, delivered with the PDF in a ZIP.",
          ),
          t(
            "ocr.tooltip.output.compatibilityMode",
            "Compatibility Mode in Advanced embeds the text as a separate layer for readers that expect it.",
          ),
        ],
      },
    ],
  };
};
