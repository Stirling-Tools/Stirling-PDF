import { PDFDocument } from 'pdf-lib';
import type { MergeParameters } from '@app/hooks/tools/merge/useMergeParameters';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

export async function mergePdfClientSide(
  _params: MergeParameters, // Cant use params in browser implementation
  files: File[]
): Promise<File[]> {
  if (files.length === 0) {
    throw new Error('No files provided for merge');
  }

  // Create a new PDF document
  const mergedPdf = await PDFDocument.create();

  // Copy all pages from each input PDF in order
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

    // Copy all pages from this PDF
    const pageIndices = Array.from({ length: sourcePdf.getPageCount() }, (_, i) => i);
    const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);

    // Add all copied pages to the merged document
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }

  // Note: Browser implementation doesn't support:
  // - removeDigitalSignature (requires crypto operations)
  // - generateTableOfContents (requires bookmark manipulation which pdf-lib doesn't support well)

  // Save the merged PDF
  const mergedBytes = await mergedPdf.save();

  // Generate output filename
  const outputName = files.length === 1
    ? `${files[0].name.replace(/\.[^.]+$/, '')}_merged.pdf`
    : 'merged.pdf';

  return [createFileFromApiResponse(mergedBytes, { 'content-type': PDF_MIME_TYPE }, outputName)];
}
