import { PdfiumFont } from "@editor/services/pdfiumDocBuilder";

/** Breaks text into lines no wider than maxWidth; each newline in the input starts a new line. */
export const wrapText = (
  text: string,
  font: PdfiumFont,
  fontSize: number,
  maxWidth: number,
): string[] => {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);

  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) {
      lines.push("");
      return;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = "";
    words.forEach((word) => {
      const tentative =
        currentLine.length > 0 ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(tentative, fontSize);
      if (width <= maxWidth) {
        currentLine = tentative;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    });
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  });

  return lines;
};
