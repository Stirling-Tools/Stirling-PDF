import { degrees, PDFDocument, PDFPage, rgb } from 'pdf-lib';
import type { AddStampParameters } from '../../components/tools/addStamp/useAddStampParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';
import { resolvePageNumbers } from '../pageSelection';
import { loadFontForAlphabet } from './fontCache';

const PDF_MIME_TYPE = 'application/pdf';

const DEFAULT_STAMP_COLOR = rgb(0.83, 0.83, 0.83);

const MARGIN_FACTORS: Record<AddStampParameters['customMargin'], number> = {
  small: 0.02,
  medium: 0.035,
  large: 0.05,
  'x-large': 0.075,
};

const parseStampColor = (input: string | undefined) => {
  if (!input) return DEFAULT_STAMP_COLOR;
  let hex = input.trim();
  if (!hex.startsWith('#')) {
    hex = `#${hex}`;
  }

  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  if (!/^#([0-9a-f]{6})$/i.test(hex)) {
    return DEFAULT_STAMP_COLOR;
  }

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
};

const clampOpacity = (value: number | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value / 100));
};

const getMargin = (pageWidth: number, pageHeight: number, marginKey: AddStampParameters['customMargin']) => {
  const factor = MARGIN_FACTORS[marginKey] ?? MARGIN_FACTORS.medium;
  return factor * ((pageWidth + pageHeight) / 2);
};

const computePositionX = (
  pageWidth: number,
  contentWidth: number,
  position: number,
  margin: number
) => {
  switch (position % 3) {
    case 1:
      return margin;
    case 2:
      return (pageWidth - contentWidth) / 2;
    case 0:
      return pageWidth - contentWidth - margin;
    default:
      return margin;
  }
};

const computePositionY = (
  pageHeight: number,
  contentHeight: number,
  position: number,
  margin: number
) => {
  const row = Math.floor((position - 1) / 3);
  switch (row) {
    case 0:
      return pageHeight - contentHeight - margin;
    case 1:
      return (pageHeight - contentHeight) / 2;
    case 2:
      return margin;
    default:
      return margin;
  }
};

async function drawTextStamp(
  pdfDoc: PDFDocument,
  page: PDFPage,
  params: AddStampParameters,
  opacity: number
) {
  const fontSize = params.fontSize > 0 ? params.fontSize : 12;
  const font = await loadFontForAlphabet(pdfDoc, params.alphabet);
  const lines = (params.stampText || '').split(/\r?\n/);
  const lineHeight = font.heightAtSize(fontSize);
  const blockHeight = lineHeight * Math.max(1, lines.length);
  const blockWidth = lines.reduce((max, line) => Math.max(max, font.widthOfTextAtSize(line, fontSize)), 0);

  const { width: pageWidth, height: pageHeight } = page.getSize();
  const margin = getMargin(pageWidth, pageHeight, params.customMargin);

  const baseX = params.overrideX >= 0 ? params.overrideX : computePositionX(pageWidth, blockWidth, params.position, margin);
  const baseY = params.overrideY >= 0 ? params.overrideY : computePositionY(pageHeight, blockHeight, params.position, margin);

  page.drawText(lines.join('\n'), {
    x: baseX,
    y: baseY,
    size: fontSize,
    font,
    color: parseStampColor(params.customColor),
    lineHeight,
    rotate: degrees(params.rotation ?? 0),
    opacity,
  });
}

async function drawImageStamp(
  pdfDoc: PDFDocument,
  page: PDFPage,
  params: AddStampParameters,
  opacity: number
) {
  const stampImage = params.stampImage;
  if (!stampImage) return;

  const bytes = new Uint8Array(await stampImage.arrayBuffer());

  const isPng = stampImage.type.includes('png');
  const isJpg = stampImage.type.includes('jpg') || stampImage.type.includes('jpeg');

  const embedded = isPng
    ? await pdfDoc.embedPng(bytes)
    : isJpg
      ? await pdfDoc.embedJpg(bytes)
      : null;

  if (!embedded) {
    throw new Error('Unsupported stamp image type for browser processing');
  }

  const aspectRatio = embedded.width / embedded.height || 1;
  const desiredHeight = params.fontSize > 0 ? params.fontSize : embedded.height;
  const desiredWidth = desiredHeight * aspectRatio;

  const { width: pageWidth, height: pageHeight } = page.getSize();
  const margin = getMargin(pageWidth, pageHeight, params.customMargin);

  const baseX = params.overrideX >= 0 ? params.overrideX : computePositionX(pageWidth, desiredWidth, params.position, margin);
  const baseY = params.overrideY >= 0 ? params.overrideY : computePositionY(pageHeight, desiredHeight, params.position, margin);

  page.drawImage(embedded, {
    x: baseX,
    y: baseY,
    width: desiredWidth,
    height: desiredHeight,
    rotate: degrees(params.rotation ?? 0),
    opacity,
  });
}

export async function addStampClientSide(
  params: AddStampParameters,
  files: File[]
): Promise<File[]> {
  const opacity = clampOpacity(params.opacity);

  return Promise.all(files.map(async (file) => {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    const targetPages = resolvePageNumbers(params.pageNumbers || '', pdfDoc.getPageCount());
    if (targetPages === null) {
      throw new Error('Page selection is not supported in browser mode');
    }

    if (targetPages.length === 0) {
      return createFileFromApiResponse(bytes, { 'content-type': PDF_MIME_TYPE }, file.name);
    }

    for (const pageIndex of targetPages) {
      const page = pdfDoc.getPage(pageIndex);
      if (!page) continue;

      if (params.stampType === 'image') {
        await drawImageStamp(pdfDoc, page, params, opacity);
      } else {
        await drawTextStamp(pdfDoc, page, params, opacity);
      }
    }

    const pdfBytes = await pdfDoc.save();
    return createFileFromApiResponse(pdfBytes, { 'content-type': PDF_MIME_TYPE }, file.name);
  }));
}
