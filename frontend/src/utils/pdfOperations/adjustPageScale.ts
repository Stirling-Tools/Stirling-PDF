import { PDFDocument } from 'pdf-lib';
import type { AdjustPageScaleParameters, PageSize } from '../../hooks/tools/adjustPageScale/useAdjustPageScaleParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

const PAGE_DIMENSIONS: Record<PageSize, [number, number]> = {
  KEEP: [0, 0],
  A0: [2383.94, 3370.39],
  A1: [1683.78, 2383.94],
  A2: [1190.55, 1683.78],
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  A6: [297.64, 419.53],
  LETTER: [612, 792],
  LEGAL: [612, 1008],
};

const getTargetSize = (pageSize: PageSize, firstPage: [number, number]): [number, number] => {
  if (pageSize === 'KEEP') {
    return firstPage;
  }
  return PAGE_DIMENSIONS[pageSize];
};

export async function adjustPageScaleClientSide(
  params: AdjustPageScaleParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const output = await PDFDocument.create();
      const [firstPage] = pdfDoc.getPages();
      const firstSize: [number, number] = [firstPage.getWidth(), firstPage.getHeight()];
      const targetSize = getTargetSize(params.pageSize, firstSize);

      for (let i = 0; i < pdfDoc.getPageCount(); i += 1) {
        const page = pdfDoc.getPage(i);
        const embedded = await output.embedPage(page);
        const [targetWidth, targetHeight] = targetSize;
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();

        const scaleWidth = targetWidth / pageWidth;
        const scaleHeight = targetHeight / pageHeight;
        const scale = Math.min(scaleWidth, scaleHeight) * params.scaleFactor;

        const newPage = output.addPage([targetWidth, targetHeight]);
        const drawWidth = pageWidth * scale;
        const drawHeight = pageHeight * scale;
        const x = (targetWidth - drawWidth) / 2;
        const y = (targetHeight - drawHeight) / 2;

        newPage.drawPage(embedded, {
          x,
          y,
          width: drawWidth,
          height: drawHeight,
        });
      }

      const scaledBytes = await output.save();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      return createFileFromApiResponse(scaledBytes, { 'content-type': PDF_MIME_TYPE }, `${baseName}_scaled.pdf`);
    })
  );
}
