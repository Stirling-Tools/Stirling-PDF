import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

interface IndexedInsertModule {
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    index: number,
  ) => boolean | number;
}

/** PDFium's indexed insert, or undefined in a build without it. */
export function indexedInsertOf(
  m: WrappedPdfiumModule,
): IndexedInsertModule["FPDFPage_InsertObjectAtIndex"] {
  return (m as unknown as IndexedInsertModule).FPDFPage_InsertObjectAtIndex;
}

/**
 * Puts a detached object on the page at `index` in content order, or last
 * when `index` is negative, past the end of the page, or this build has no
 * indexed insert.
 *
 * PDFium destroys an object it is asked to insert past the end, so an index
 * recorded earlier is never passed through as it is: the page may have lost
 * objects since, and the caller would be left holding a freed pointer.
 */
export function insertPageObjectAt(
  m: WrappedPdfiumModule,
  pagePtr: number,
  objPtr: number,
  index: number,
): void {
  const insertAt = indexedInsertOf(m);
  if (index < 0 || !insertAt) {
    m.FPDFPage_InsertObject(pagePtr, objPtr);
    return;
  }
  insertAt(pagePtr, objPtr, Math.min(index, m.FPDFPage_CountObjects(pagePtr)));
}
