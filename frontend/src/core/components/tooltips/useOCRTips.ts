import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useOCRTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("ocr.tooltip.header.title", "OCR Settings Overview"),
    },
    tips: [
      {
        title: t("ocr.tooltip.mode.title", "OCR Mode"),
        description: t("ocr.tooltip.mode.text", "Optical Character Recognition (OCR) helps you turn scanned or screenshotted pages into text you can search, copy, or highlight."),
        bullets: [
          t("ocr.tooltip.mode.bullet1", "Auto skips pages that already contain text layers."),
          t("ocr.tooltip.mode.bullet2", "Force re-OCRs every page and replaces all the text."),
          t("ocr.tooltip.mode.bullet3", "Strict halts if any selectable text is found.")
        ]
      },
      {
        title: t("ocr.tooltip.languages.title", "Languages"),
        description: t("ocr.tooltip.languages.text", "Improve OCR accuracy by specifying the expected languages. Choose one or more languages to guide detection.")
      },
      {
        title: t("ocr.tooltip.output.title", "Output"),
        description: t("ocr.tooltip.output.text", "Decide how you want the text output formatted:"),
        bullets: [
          t("ocr.tooltip.output.bullet1", "Searchable PDF embeds text behind the original image."),
          t("ocr.tooltip.output.bullet2", "HOCR XML returns a structured machine-readable file."),
          t("ocr.tooltip.output.bullet3", "Plain-text sidecar creates a separate .txt file with raw content.")
        ]
      }
    ]
  };
};
