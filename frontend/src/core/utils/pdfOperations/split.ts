import { PDFDocument } from 'pdf-lib';
import type { SplitParameters } from '@app/hooks/tools/split/useSplitParameters';
import { resolvePageNumbers, validatePageNumbers } from '@app/utils/pageSelection';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';
import { SPLIT_METHODS } from '@app/constants/splitConstants';

const PDF_MIME_TYPE = 'application/pdf';

const getSplitPointsByPages = (pages: string, totalPages: number): number[] | null => {
  if (!pages.trim()) {
    return Array.from({ length: totalPages }, (_, idx) => idx);
  }

  if (!validatePageNumbers(pages)) {
    return null;
  }

  const resolved = resolvePageNumbers(pages, totalPages);
  if (!resolved) {
    return null;
  }

  const sorted = Array.from(new Set(resolved)).sort((a, b) => a - b);
  if (sorted[sorted.length - 1] !== totalPages - 1) {
    sorted.push(totalPages - 1);
  }
  return sorted;
};

const getSplitPointsByPageCount = (pagesPerDoc: number, totalPages: number): number[] => {
  const splitPoints: number[] = [];
  for (let i = pagesPerDoc - 1; i < totalPages; i += pagesPerDoc) {
    splitPoints.push(i);
  }
  // Ensure the last page is included
  if (splitPoints[splitPoints.length - 1] !== totalPages - 1) {
    splitPoints.push(totalPages - 1);
  }
  return splitPoints;
};

const getSplitPointsByDocCount = (docCount: number, totalPages: number): number[] => {
  const pagesPerDoc = Math.ceil(totalPages / docCount);
  return getSplitPointsByPageCount(pagesPerDoc, totalPages);
};

const getSplitPoints = (params: SplitParameters, totalPages: number): number[] | null => {
  switch (params.method) {
    case SPLIT_METHODS.BY_PAGES:
      return getSplitPointsByPages(params.pages, totalPages);

    case SPLIT_METHODS.BY_PAGE_COUNT: {
      const pagesPerDoc = parseInt(params.splitValue, 10);
      if (isNaN(pagesPerDoc) || pagesPerDoc <= 0) {
        throw new Error('Invalid pages per document count');
      }
      return getSplitPointsByPageCount(pagesPerDoc, totalPages);
    }

    case SPLIT_METHODS.BY_DOC_COUNT: {
      const docCount = parseInt(params.splitValue, 10);
      if (isNaN(docCount) || docCount <= 0) {
        throw new Error('Invalid document count');
      }
      return getSplitPointsByDocCount(docCount, totalPages);
    }

    default:
      throw new Error(`Unsupported split method for browser processing: ${params.method}`);
  }
};

async function splitPdfBySize(
  params: SplitParameters,
  files: File[]
): Promise<File[]> {
  // Parse size threshold in bytes (backend expects bytes)
  const maxSizeBytes = parseInt(params.splitValue, 10);
  if (isNaN(maxSizeBytes) || maxSizeBytes <= 0) {
    throw new Error('Invalid size threshold');
  }

  return Promise.all(
    files.flatMap(async (file) => {
      const bytes = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const totalPages = sourcePdf.getPageCount();

      const outputs: File[] = [];
      let currentDoc = await PDFDocument.create();
      let partIndex = 1;

      for (let i = 0; i < totalPages; i++) {
        // Copy the current page to the working document
        const [copiedPage] = await currentDoc.copyPages(sourcePdf, [i]);
        currentDoc.addPage(copiedPage);

        // Check current document size
        const currentBytes = await currentDoc.save();
        const currentSize = currentBytes.byteLength;

        // If size exceeds threshold, save this document (excluding current page if multiple pages)
        if (currentSize > maxSizeBytes && currentDoc.getPageCount() > 1) {
          // Remove the last page that pushed us over
          currentDoc.removePage(currentDoc.getPageCount() - 1);

          // Save the document without the oversized page
          const finalBytes = await currentDoc.save();
          const baseName = file.name.replace(/\.[^.]+$/, '');
          const outputName = `${baseName}_${partIndex}.pdf`;
          outputs.push(
            createFileFromApiResponse(finalBytes, { 'content-type': PDF_MIME_TYPE }, outputName)
          );

          // Start new document with the page that was removed
          currentDoc = await PDFDocument.create();
          const [pageToAdd] = await currentDoc.copyPages(sourcePdf, [i]);
          currentDoc.addPage(pageToAdd);

          partIndex++;
        }
      }

      // Save the final document if it has pages
      if (currentDoc.getPageCount() > 0) {
        const finalBytes = await currentDoc.save();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const outputName = `${baseName}_${partIndex}.pdf`;
        outputs.push(
          createFileFromApiResponse(finalBytes, { 'content-type': PDF_MIME_TYPE }, outputName)
        );
      }

      return outputs;
    })
  ).then((nested) => nested.flat());
}

export async function splitPdfClientSide(
  params: SplitParameters,
  files: File[]
): Promise<File[]> {
  // Handle BY_SIZE method separately as it requires incremental size checking
  if (params.method === SPLIT_METHODS.BY_SIZE) {
    return splitPdfBySize(params, files);
  }

  // Handle BY_PAGES, BY_PAGE_COUNT, and BY_DOC_COUNT using split points
  return Promise.all(
    files.flatMap(async (file) => {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      const splitPoints = getSplitPoints(params, totalPages);

      if (!splitPoints || splitPoints.length === 0) {
        throw new Error('Invalid page selection for split');
      }

      const outputs: File[] = [];
      let previous = 0;
      let partIndex = 1;

      for (const splitPoint of splitPoints) {
        if (splitPoint < previous) continue;
        const segment = await PDFDocument.create();
        const indexes: number[] = [];
        for (let i = previous; i <= Math.min(splitPoint, totalPages - 1); i += 1) {
          indexes.push(i);
        }

        if (indexes.length === 0) {
          continue;
        }

        const copiedPages = await segment.copyPages(pdfDoc, indexes);
        copiedPages.forEach((p) => segment.addPage(p));
        const segmentBytes = await segment.save();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const outputName = `${baseName}_${partIndex}.pdf`;
        outputs.push(
          createFileFromApiResponse(segmentBytes, { 'content-type': PDF_MIME_TYPE }, outputName)
        );
        previous = splitPoint + 1;
        partIndex += 1;
      }

      return outputs;
    })
  ).then((nested) => nested.flat());
}
