import { PDFDocument } from '@app/types/pageEditor';

/**
 * Build a map from page ID to its index in the provided document.
 */
export function buildPageIdIndexMap(document: PDFDocument | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!document) return map;
  document.pages.forEach((page, index) => {
    map.set(page.id, index);
  });
  return map;
}

/**
 * Convert a set of split page IDs (the page preceding each split) into
 * the current index positions inside the document.
 */
export function convertSplitPageIdsToIndexes(document: PDFDocument | null, splitPageIds: Set<string>): Set<number> {
  const indexes = new Set<number>();
  if (!document || !splitPageIds || splitPageIds.size === 0) {
    return indexes;
  }

  const totalPages = document.pages.length;
  document.pages.forEach((page, index) => {
    if (index >= totalPages - 1) {
      return; // Cannot split after the last page.
    }
    if (splitPageIds.has(page.id)) {
      indexes.add(index);
    }
  });

  return indexes;
}
