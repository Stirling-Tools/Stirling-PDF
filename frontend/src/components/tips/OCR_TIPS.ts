import { useTranslation } from 'react-i18next';
import { TooltipContent } from './types';

export const useOcrTips = (): TooltipContent => {
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
          t("ocr.tooltip.mode.bullet1", "<strong>Auto</strong> skips pages that already contain text layers."),
          t("ocr.tooltip.mode.bullet2", "<strong>Force</strong> re-OCRs every page and replaces all the text."),
          t("ocr.tooltip.mode.bullet3", "<strong>Strict</strong> halts if any selectable text is found.")
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
          t("ocr.tooltip.output.bullet1", "<strong>Searchable PDF</strong> embeds text behind the original image."),
          t("ocr.tooltip.output.bullet2", "<strong>HOCR XML</strong> returns a structured machine-readable file."),
          t("ocr.tooltip.output.bullet3", "<strong>Plain-text sidecar</strong> creates a separate .txt file with raw content.")
        ]
      }
    ]
  };
}; 