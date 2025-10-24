import { PDFFont, PDFPage, rgb } from 'pdf-lib';

interface StatusBadgeOptions {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  text: string;
  x: number;
  y: number;
  color: ReturnType<typeof rgb>;
}

export const drawStatusBadge = ({ page, font, fontBold, text, x, y, color }: StatusBadgeOptions): number => {
  const paddingX = 14;
  const paddingY = 6;
  const fontSize = 10;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const width = textWidth + paddingX * 2;
  const height = fontSize + paddingY * 2;

  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color,
  });

  page.drawText(text, {
    x: x + paddingX,
    y: y - paddingY - fontSize + 2,
    size: fontSize,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  return width;
};
