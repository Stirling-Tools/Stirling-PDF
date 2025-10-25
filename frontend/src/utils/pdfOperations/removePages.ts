import { PDFDocument } from 'pdf-lib';
import type { RemovePagesParameters } from '../../hooks/tools/removePages/useRemovePagesParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';
import { resolvePageNumbers } from '../pageSelection';

const PDF_MIME_TYPE = 'application/pdf';

export async function removePagesClientSide(
  params: RemovePagesParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(files.map(async (file) => {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    const pageCount = pdfDoc.getPageCount();
    const toRemove = resolvePageNumbers(params.pageNumbers || '', pageCount);
    if (toRemove === null) {
      throw new Error('Page selection is not supported in browser mode');
    }

    if (toRemove.length === 0) {
      return createFileFromApiResponse(bytes, { 'content-type': PDF_MIME_TYPE }, file.name);
    }

    const sorted = Array.from(new Set(toRemove)).filter(index => index >= 0 && index < pageCount).sort((a, b) => b - a);

    sorted.forEach((index) => {
      pdfDoc.removePage(index);
    });

    const outputBytes = await pdfDoc.save();
    return createFileFromApiResponse(outputBytes, { 'content-type': PDF_MIME_TYPE }, file.name);
  }));
}
