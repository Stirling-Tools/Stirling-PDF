import { PDFDocument } from 'pdf-lib';
import type { SingleLargePageParameters } from '../../hooks/tools/singleLargePage/useSingleLargePageParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

export async function singleLargePageClientSide(
  _params: SingleLargePageParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const output = await PDFDocument.create();

      let totalHeight = 0;
      let maxWidth = 0;
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        totalHeight += page.getHeight();
        maxWidth = Math.max(maxWidth, page.getWidth());
      }

      const newPage = output.addPage([maxWidth, totalHeight]);
      let yOffset = totalHeight;

      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i];
        const embedded = await output.embedPage(page);
        const height = page.getHeight();
        const width = page.getWidth();
        yOffset -= height;
        newPage.drawPage(embedded, {
          x: 0,
          y: yOffset,
          width,
          height,
        });
      }

      const mergedBytes = await output.save();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      return createFileFromApiResponse(mergedBytes, { 'content-type': PDF_MIME_TYPE }, `${baseName}_singlePage.pdf`);
    })
  );
}
