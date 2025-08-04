import { TooltipContent } from './types';

export const ocrTips: TooltipContent = {
  header: {
    title: "Basic Settings Overview",
  },
  tips: [
    {
      title: "OCR Mode",
      description: "Optical Character Recognition (OCR) helps you turn scanned or screenshotted pages into text you can search, copy, or highlight.",
      bullets: [
        "<strong>Auto</strong> skips pages that already contain text layers.",
        "<strong>Force</strong> re-OCRs every page and replaces all the text.",
        "<strong>Strict</strong> halts if any selectable text is found."
      ]
    },
    {
      title: "Languages",
      description: "Improve OCR accuracy by specifying the expected languages. Choose one or more languages to guide detection."
    },
    {
      title: "Output",
      description: "Decide how you want the text output formatted:",
      bullets: [
        "<strong>Searchable PDF</strong> embeds text behind the original image.",
        "<strong>HOCR XML</strong> returns a structured machine-readable file.",
        "<strong>Plain-text sidecar</strong> creates a separate .txt file with raw content."
      ]
    }
  ]
}; 