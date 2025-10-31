import { PDFDocument, rgb } from 'pdf-lib';
import type { PageLayoutParameters } from '../../hooks/tools/pageLayout/usePageLayoutParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

const getGrid = (pagesPerSheet: number): { columns: number; rows: number } => {
  if (pagesPerSheet === 2 || pagesPerSheet === 3) {
    return { columns: pagesPerSheet, rows: 1 };
  }
  const size = Math.sqrt(pagesPerSheet);
  return { columns: size, rows: size };
};

export async function pageLayoutClientSide(
  params: PageLayoutParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const output = await PDFDocument.create();
      const { columns, rows } = getGrid(params.pagesPerSheet);
      const cellWidth = A4_WIDTH / columns;
      const cellHeight = A4_HEIGHT / rows;

      let currentPage = output.addPage([A4_WIDTH, A4_HEIGHT]);
      let cellIndex = 0;

      for (let i = 0; i < pdfDoc.getPageCount(); i += 1) {
        if (cellIndex > 0 && cellIndex % params.pagesPerSheet === 0) {
          currentPage = output.addPage([A4_WIDTH, A4_HEIGHT]);
          cellIndex = 0;
        }

        const page = pdfDoc.getPage(i);
        const embedded = await output.embedPage(page);
        const sourceWidth = page.getWidth();
        const sourceHeight = page.getHeight();

        const colIndex = cellIndex % columns;
        const rowIndex = Math.floor(cellIndex / columns);

        const scale = Math.min(cellWidth / sourceWidth, cellHeight / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        const x = colIndex * cellWidth + (cellWidth - drawWidth) / 2;
        const y = A4_HEIGHT - (rowIndex + 1) * cellHeight + (cellHeight - drawHeight) / 2;

        currentPage.drawPage(embedded, {
          x,
          y,
          width: drawWidth,
          height: drawHeight,
        });

        if (params.addBorder) {
          currentPage.drawRectangle({
            x: colIndex * cellWidth,
            y: A4_HEIGHT - (rowIndex + 1) * cellHeight,
            width: cellWidth,
            height: cellHeight,
            borderWidth: 1.5,
            borderColor: rgb(0, 0, 0),
          });
        }

        cellIndex += 1;
      }

      const mergedBytes = await output.save();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      return createFileFromApiResponse(mergedBytes, { 'content-type': PDF_MIME_TYPE }, `${baseName}_layoutChanged.pdf`);
    })
  );
}
