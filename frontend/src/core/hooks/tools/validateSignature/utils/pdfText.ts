import { PDFFont } from '@cantoo/pdf-lib';

export const wrapText = (text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);

  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) {
      lines.push('');
      return;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = '';
    words.forEach((word) => {
      const tentative = currentLine.length > 0 ? `${currentLine} ${word}` : word;
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

export const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, exponent);
  return `${size.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

export const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString();
  }
  return value;
};
