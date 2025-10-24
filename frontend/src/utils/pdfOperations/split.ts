import { PDFDocument } from 'pdf-lib';
import type { SplitParameters } from '../../hooks/tools/split/useSplitParameters';
import { resolvePageNumbers, validatePageNumbers } from '../pageSelection';
import { createFileFromApiResponse } from '../fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

const getSplitPoints = (pages: string, totalPages: number): number[] | null => {
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

export async function splitPdfClientSide(
  params: SplitParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.flatMap(async (file) => {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      const splitPoints = getSplitPoints(params.pages, totalPages);

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
