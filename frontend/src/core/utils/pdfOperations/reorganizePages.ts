import { PDFDocument } from 'pdf-lib';
import type { ReorganizePagesParameters } from '@app/hooks/tools/reorganizePages/useReorganizePagesParameters';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';
import { resolvePageOrderSequence } from '@app/utils/pageSelection';

const PDF_MIME_TYPE = 'application/pdf';

type ModeHandler = (totalPages: number, rawOrder: string) => number[];

const clamp = (value: number, max: number) => {
  if (value < 0) return 0;
  if (value >= max) return max - 1;
  return value;
};

const reverseOrder: ModeHandler = (total) => {
  const result: number[] = [];
  for (let i = total - 1; i >= 0; i -= 1) {
    result.push(i);
  }
  return result;
};

const duplexSort: ModeHandler = (total) => {
  const result: number[] = [];
  const half = Math.ceil(total / 2);
  for (let i = 0; i < half; i += 1) {
    result.push(i);
    const mirror = total - i - 1;
    if (mirror >= half) {
      result.push(mirror);
    }
  }
  return result;
};

const bookletSort: ModeHandler = (total) => {
  const result: number[] = [];
  const limit = Math.floor(total / 2);
  for (let i = 0; i < limit; i += 1) {
    result.push(i);
    result.push(clamp(total - i - 1, total));
  }
  if (total % 2 === 1) {
    result.push(limit);
  }
  return result;
};

const sideStitchBooklet: ModeHandler = (total) => {
  const result: number[] = [];
  const signatures = Math.ceil(total / 4);
  for (let sig = 0; sig < signatures; sig += 1) {
    const base = sig * 4;
    result.push(clamp(base + 3, total));
    result.push(clamp(base, total));
    result.push(clamp(base + 1, total));
    result.push(clamp(base + 2, total));
  }
  return result;
};

const oddEvenSplit: ModeHandler = (total) => {
  const result: number[] = [];
  for (let i = 0; i < total; i += 2) result.push(i);
  for (let i = 1; i < total; i += 2) result.push(i);
  return result;
};

const oddEvenMerge: ModeHandler = (total) => {
  const result: number[] = [];
  const oddCount = Math.ceil(total / 2);
  for (let i = 0; i < oddCount; i += 1) {
    result.push(i);
    const evenIndex = oddCount + i;
    if (evenIndex < total) {
      result.push(evenIndex);
    }
  }
  return result;
};

const removeFirst: ModeHandler = (total) => {
  const result: number[] = [];
  for (let i = 1; i < total; i += 1) result.push(i);
  return result;
};

const removeLast: ModeHandler = (total) => {
  const result: number[] = [];
  for (let i = 0; i < total - 1; i += 1) result.push(i);
  return result;
};

const removeFirstAndLast: ModeHandler = (total) => {
  const result: number[] = [];
  for (let i = 1; i < total - 1; i += 1) result.push(i);
  return result;
};

const duplicateMode: ModeHandler = (total, rawOrder) => {
  const duplicates = Math.max(1, Number.parseInt(rawOrder.trim(), 10) || 2);
  const result: number[] = [];
  for (let i = 0; i < total; i += 1) {
    for (let j = 0; j < duplicates; j += 1) {
      result.push(i);
    }
  }
  return result;
};

const MODE_HANDLERS: Record<string, ModeHandler> = {
  REVERSE_ORDER: reverseOrder,
  DUPLEX_SORT: duplexSort,
  BOOKLET_SORT: bookletSort,
  SIDE_STITCH_BOOKLET_SORT: sideStitchBooklet,
  ODD_EVEN_SPLIT: oddEvenSplit,
  ODD_EVEN_MERGE: oddEvenMerge,
  REMOVE_FIRST: removeFirst,
  REMOVE_LAST: removeLast,
  REMOVE_FIRST_AND_LAST: removeFirstAndLast,
  DUPLICATE: duplicateMode,
};

const resolveOrder = (params: ReorganizePagesParameters, totalPages: number): number[] => {
  const mode = params.customMode;
  if (!mode || mode.toUpperCase() === 'CUSTOM') {
    const resolved = resolvePageOrderSequence(params.pageNumbers, totalPages);
    if (!resolved) {
      throw new Error('Invalid page order');
    }
    return resolved.length > 0 ? resolved : Array.from({ length: totalPages }, (_, idx) => idx);
  }

  const handler = MODE_HANDLERS[mode.toUpperCase()];
  if (!handler) {
    throw new Error('Unsupported reorganize mode');
  }
  return handler(totalPages, params.pageNumbers || '');
};

export async function reorganizePagesClientSide(
  params: ReorganizePagesParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      const order = resolveOrder(params, totalPages);

      const output = await PDFDocument.create();
      for (const index of order) {
        if (index < 0 || index >= totalPages) continue;
        const [copied] = await output.copyPages(pdfDoc, [index]);
        output.addPage(copied);
      }

      const pdfBytes = await output.save();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      return createFileFromApiResponse(pdfBytes, { 'content-type': PDF_MIME_TYPE }, `${baseName}_rearranged.pdf`);
    })
  );
}
