import { PDFDocument, PDFFont, PDFImage } from 'pdf-lib';
import type { TFunction } from 'i18next';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';

interface StartPageParams {
  doc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  marginX: number;
  marginY: number;
  contentWidth: number;
  pageWidth: number;
  pageHeight: number;
  title: string;
  isContinuation: boolean;
  t: TFunction<'translation'>;
}

export const startReportPage = ({
  doc,
  font,
  fontBold,
  marginX,
  marginY,
  pageWidth,
  pageHeight,
  title,
  isContinuation,
  t,
}: StartPageParams) => {
  const page = doc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - marginY;

  if (isContinuation) {
    const heading = `${title} - ${t('validateSignature.report.continued', 'Continued')}`;
    page.drawText(heading, {
      x: marginX,
      y: cursorY - 18,
      size: 12,
      font: fontBold,
      color: colorPalette.textMuted,
    });
    cursorY -= 36;
  }

  const pageNumber = doc.getPageCount();
  page.drawText(`${t('validateSignature.report.page', 'Page')} ${pageNumber}`, {
    x: pageWidth - marginX - 80,
    y: marginY / 2,
    size: 9,
    font,
    color: colorPalette.textMuted,
  });

  page.drawText(t('validateSignature.report.footer', 'Validated via Stirling PDF'), {
    x: marginX,
    y: marginY / 2,
    size: 9,
    font,
    color: colorPalette.textMuted,
  });

  return { page, cursorY };
};

export const createThumbnailLoader = (doc: PDFDocument) => {
  const cache = new Map<string, { image: PDFImage } | null>();

  return async (url: string) => {
    if (cache.has(url)) {
      return cache.get(url) ?? null;
    }

    try {
      const response = await fetch(url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || '';
      let image: PDFImage;

      if (contentType.includes('png')) {
        image = await doc.embedPng(bytes);
      } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        image = await doc.embedJpg(bytes);
      } else {
        try {
          image = await doc.embedPng(bytes);
        } catch {
          image = await doc.embedJpg(bytes);
        }
      }

      const result = { image };
      cache.set(url, result);
      return result;
    } catch (error) {
      console.warn('[validateSignature] Failed to load thumbnail', error);
      cache.set(url, null);
      return null;
    }
  };
};
