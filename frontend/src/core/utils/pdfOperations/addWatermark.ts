import { degrees, PDFDocument, rgb } from 'pdf-lib';
import type { AddWatermarkParameters } from '../../hooks/tools/addWatermark/useAddWatermarkParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';
import { loadFontForAlphabet } from './fontCache';

const PDF_MIME_TYPE = 'application/pdf';

const DEFAULT_WATERMARK_COLOR = rgb(0.83, 0.83, 0.83);

const toRadians = (degreesValue: number) => (degreesValue * Math.PI) / 180;

const parseHexColor = (input: string | undefined) => {
  if (!input) return DEFAULT_WATERMARK_COLOR;
  let hex = input.trim();
  if (!hex.startsWith('#')) {
    hex = `#${hex}`;
  }

  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  if (!/^#([0-9a-f]{6})$/i.test(hex)) {
    return DEFAULT_WATERMARK_COLOR;
  }

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
};

const clampOpacity = (opacity: number | undefined) => {
  if (typeof opacity !== 'number' || Number.isNaN(opacity)) return 0.5;
  return Math.max(0, Math.min(1, opacity / 100));
};

async function applyTextWatermark(
  pdfDoc: PDFDocument,
  params: AddWatermarkParameters,
  opacity: number
) {
  const font = await loadFontForAlphabet(pdfDoc, params.alphabet);
  const lines = (params.watermarkText || '').split(/\r?\n/);
  const fontSize = params.fontSize > 0 ? params.fontSize : 12;

  const widths = lines.map(line => font.widthOfTextAtSize(line || '', fontSize));
  const maxLineWidth = widths.reduce((max, width) => Math.max(max, width), 0);
  const lineHeight = font.heightAtSize(fontSize);
  const blockHeight = lineHeight * Math.max(1, lines.length);

  const tileWidth = maxLineWidth + (params.widthSpacer ?? 0);
  const tileHeight = blockHeight + (params.heightSpacer ?? 0);
  const rad = toRadians(params.rotation ?? 0);

  const rotatedWidth = Math.abs(tileWidth * Math.cos(rad)) + Math.abs(tileHeight * Math.sin(rad));
  const rotatedHeight = Math.abs(tileWidth * Math.sin(rad)) + Math.abs(tileHeight * Math.cos(rad));

  const color = parseHexColor(params.customColor);

  pdfDoc.getPages().forEach(page => {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const columns = Math.ceil(pageWidth / Math.max(rotatedWidth, 1)) + 1;
    const rows = Math.ceil(pageHeight / Math.max(rotatedHeight, 1)) + 1;

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const x = column * rotatedWidth;
        const y = row * rotatedHeight;

        page.drawText(lines.join('\n'), {
          x,
          y,
          size: fontSize,
          font,
          color,
          rotate: degrees(params.rotation ?? 0),
          lineHeight,
          opacity,
        });
      }
    }
  });
}

async function applyImageWatermark(
  pdfDoc: PDFDocument,
  params: AddWatermarkParameters,
  opacity: number
) {
  const watermarkImage = params.watermarkImage;
  if (!watermarkImage) return;

  const imageBytes = new Uint8Array(await watermarkImage.arrayBuffer());
  const isPng = watermarkImage.type.includes('png');
  const isJpg = watermarkImage.type.includes('jpg') || watermarkImage.type.includes('jpeg');

  const image = isPng
    ? await pdfDoc.embedPng(imageBytes)
    : isJpg
      ? await pdfDoc.embedJpg(imageBytes)
      : null;

  if (!image) {
    throw new Error('Unsupported watermark image type for browser processing');
  }

  const aspectRatio = image.width / image.height;
  const desiredHeight = params.fontSize > 0 ? params.fontSize : image.height;
  const desiredWidth = desiredHeight * (aspectRatio || 1);

  const tileWidth = desiredWidth + (params.widthSpacer ?? 0);
  const tileHeight = desiredHeight + (params.heightSpacer ?? 0);
  const rad = toRadians(params.rotation ?? 0);

  const rotatedWidth = Math.abs(tileWidth * Math.cos(rad)) + Math.abs(tileHeight * Math.sin(rad));
  const rotatedHeight = Math.abs(tileWidth * Math.sin(rad)) + Math.abs(tileHeight * Math.cos(rad));

  pdfDoc.getPages().forEach(page => {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const columns = Math.ceil(pageWidth / Math.max(rotatedWidth, 1)) + 1;
    const rows = Math.ceil(pageHeight / Math.max(rotatedHeight, 1)) + 1;

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const x = column * rotatedWidth;
        const y = row * rotatedHeight;

        page.drawImage(image, {
          x,
          y,
          width: desiredWidth,
          height: desiredHeight,
          rotate: degrees(params.rotation ?? 0),
          opacity,
        });
      }
    }
  });
}

export async function addWatermarkClientSide(
  params: AddWatermarkParameters,
  files: File[]
): Promise<File[]> {
  const opacity = clampOpacity(params.opacity);

  return Promise.all(files.map(async (file) => {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    if (params.watermarkType === 'image') {
      await applyImageWatermark(pdfDoc, params, opacity);
    } else {
      await applyTextWatermark(pdfDoc, params, opacity);
    }

    const pdfBytes = await pdfDoc.save();
    return createFileFromApiResponse(pdfBytes, { 'content-type': PDF_MIME_TYPE }, file.name);
  }));
}
