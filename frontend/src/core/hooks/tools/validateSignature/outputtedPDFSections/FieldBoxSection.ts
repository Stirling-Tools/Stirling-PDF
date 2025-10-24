import { PDFFont, PDFPage } from 'pdf-lib';
import { wrapText } from '@app/hooks/tools/validateSignature/utils/pdfText';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';

interface FieldBoxOptions {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  x: number;
  top: number;
  width: number;
  label: string;
  value: string;
}

export const drawFieldBox = ({
  page,
  font,
  fontBold,
  x,
  top,
  width,
  label,
  value,
}: FieldBoxOptions): number => {
  const labelFontSize = 8;
  const valueFontSize = 11;
  const valueLineHeight = valueFontSize * 1.25;
  const boxPadding = 6;

  page.drawText(label.toUpperCase(), {
    x,
    y: top - labelFontSize,
    size: labelFontSize,
    font: fontBold,
    color: colorPalette.textMuted,
  });

  const boxTop = top - labelFontSize - 6;
  const rawValue = value && value.trim().length > 0 ? value : '--';
  const lines = wrapText(rawValue, font, valueFontSize, width - boxPadding * 2);
  const boxHeight = Math.max(valueLineHeight, lines.length * valueLineHeight) + boxPadding * 2;

  page.drawRectangle({
    x,
    y: boxTop - boxHeight,
    width,
    height: boxHeight,
    color: colorPalette.boxBackground,
    borderColor: colorPalette.boxBorder,
  });

  let textY = boxTop - boxPadding - valueFontSize;
  lines.forEach((line) => {
    const lineWidth = font.widthOfTextAtSize(line, valueFontSize);
    const available = width - boxPadding * 2;
    const centeredX = x + boxPadding + Math.max(0, (available - lineWidth) / 2);

    page.drawText(line, {
      x: centeredX,
      y: textY,
      size: valueFontSize,
      font,
      color: colorPalette.textPrimary,
    });
    textY -= valueLineHeight;
  });

  return labelFontSize + 6 + boxHeight + 6;
};
