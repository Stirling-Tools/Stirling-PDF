import { PDFFont, PDFPage, rgb } from '@cantoo/pdf-lib';
import { wrapText } from '@app/hooks/tools/validateSignature/utils/pdfText';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';

interface DrawCenteredMessageOptions {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  text: string;
  description: string;
  marginX: number;
  contentWidth: number;
  cursorY: number;
  badgeColor: ReturnType<typeof rgb>;
}

export const drawCenteredMessage = ({
  page,
  font,
  fontBold,
  text,
  description,
  marginX,
  contentWidth,
  cursorY,
  badgeColor,
}: DrawCenteredMessageOptions): number => {
  const badgeFontSize = 10;
  const badgePaddingX = 14;
  const badgePaddingY = 6;
  const badgeWidth = font.widthOfTextAtSize(text, badgeFontSize) + badgePaddingX * 2;
  const badgeHeight = badgeFontSize + badgePaddingY * 2;
  const badgeX = marginX + (contentWidth - badgeWidth) / 2;

  page.drawRectangle({
    x: badgeX,
    y: cursorY - badgeHeight,
    width: badgeWidth,
    height: badgeHeight,
    color: badgeColor,
  });

  page.drawText(text, {
    x: badgeX + badgePaddingX,
    y: cursorY - badgePaddingY - badgeFontSize + 2,
    size: badgeFontSize,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  let nextCursor = cursorY - 32;
  const lines = wrapText(description, font, 11, contentWidth * 0.75);

  lines.forEach((line) => {
    const lineWidth = font.widthOfTextAtSize(line, 11);
    const lineX = marginX + (contentWidth - lineWidth) / 2;
    page.drawText(line, {
      x: lineX,
      y: nextCursor,
      size: 11,
      font,
      color: colorPalette.textPrimary,
    });
    nextCursor -= 18;
  });

  return nextCursor - 8;
};
