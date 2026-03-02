import { PDFFont, PDFPage, PDFImage } from '@cantoo/pdf-lib';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';

export const drawThumbnailPlaceholder = (
  page: PDFPage,
  fontBold: PDFFont,
  x: number,
  top: number,
  width: number,
  height: number
) => {
  page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    color: colorPalette.boxBackground,
    borderColor: colorPalette.boxBorder,
    borderWidth: 1,
  });

  const label = 'PDF';
  const labelSize = 22;
  const labelWidth = fontBold.widthOfTextAtSize(label, labelSize);
  const labelX = x + (width - labelWidth) / 2;
  const labelY = top - height / 2 - labelSize / 2;

  page.drawText(label, {
    x: labelX,
    y: labelY,
    size: labelSize,
    font: fontBold,
    color: colorPalette.textMuted,
  });
};

export const drawThumbnailImage = (
  page: PDFPage,
  image: PDFImage,
  x: number,
  top: number,
  width: number,
  height: number
) => {
  const scaled = image.scaleToFit(width - 16, height - 16);
  const offsetX = x + (width - scaled.width) / 2;
  const offsetY = top - (height - scaled.height) / 2 - scaled.height;

  page.drawImage(image, {
    x: offsetX,
    y: offsetY,
    width: scaled.width,
    height: scaled.height,
  });
};
