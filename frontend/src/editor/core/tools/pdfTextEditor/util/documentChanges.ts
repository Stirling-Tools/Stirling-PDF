import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  topLevelFieldNames,
  withoutStructParents,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/pageAndFieldRevisions";
import {
  getPdfiumModule,
  importPages,
  readEffectivePageBox,
} from "@editor/services/pdfiumService";
import {
  addField,
  addSignatureField,
  type FormFieldKind,
} from "@editor/tools/pdfTextEditor/util/formFieldChanges";
import {
  closeCopy,
  openCopy,
  saveIncrement,
  withFloats,
  withPage,
} from "@editor/tools/pdfTextEditor/util/pdfiumCopy";
import { PAGE_SIZES } from "@editor/constants/pageSizeConstants";
import type {
  CarriedFormats,
  PageShift,
} from "@editor/tools/pdfTextEditor/util/carriedFormats";

export type PageSizeName = keyof typeof PAGE_SIZES;
export type PageOrientation = "portrait" | "landscape";

export type DocumentChange =
  | { kind: "addPage"; after: number }
  | { kind: "duplicatePage"; page: number }
  | { kind: "deletePage"; page: number }
  | {
      kind: "pageSetup";
      pages: "all" | number;
      size: PageSizeName | "current";
      inView?: number;
      orientation: PageOrientation;
    }
  | {
      kind: "addField";
      page: number;
      field: FormFieldKind;
      x: number;
      y: number;
    };

export interface ChangedDocument {
  bytes: Uint8Array;
  pageShift?: PageShift;
  restoredFormats?: CarriedFormats;
  /** The page the change is about, to show once the document reloads. */
  focusPage: number;
}

export type RefusalReason = "lastPage" | "signatureField";

export class DocumentChangeRefused extends Error {
  constructor(readonly reason: RefusalReason) {
    super(reason);
  }
}

/**
 * `bytes` with `change` made to it, as a new revision appended to the file so
 * a large document is neither rewritten nor grown by more than the change.
 */
export async function applyDocumentChange(
  bytes: Uint8Array,
  change: DocumentChange,
): Promise<ChangedDocument> {
  if (change.kind === "addField" && change.field === "signature") {
    const signed = await addSignatureField(
      bytes,
      change.page,
      change.x,
      change.y,
    );
    if (!signed) throw new DocumentChangeRefused("signatureField");
    return { bytes: signed, focusPage: change.page };
  }
  const m = await getPdfiumModule();
  const open = openCopy(m, bytes);
  let changed: ChangedDocument;
  try {
    const parsed =
      change.kind === "addField" ? await RawPdf.parse(bytes) : null;
    const taken = parsed ? topLevelFieldNames(parsed) : new Set<string>();
    const focusPage = await makeChange(m, open.docPtr, bytes, change, taken);
    changed = {
      bytes: saveIncrement(m, open.docPtr),
      focusPage,
      pageShift: pageShiftOf(change),
    };
  } finally {
    closeCopy(m, open);
  }
  if (change.kind === "duplicatePage")
    changed.bytes = await withoutStructParents(changed.bytes, change.page + 1);
  return changed;
}

async function makeChange(
  m: WrappedPdfiumModule,
  docPtr: number,
  bytes: Uint8Array,
  change: DocumentChange,
  taken: Set<string>,
): Promise<number> {
  const count = m.FPDF_GetPageCount(docPtr);
  switch (change.kind) {
    case "addPage": {
      const { width, height } = withFloats(m, 2, (ptr) => {
        if (!m.FPDF_GetPageSizeByIndexF(docPtr, change.after, ptr))
          throw new Error(`PDFium could not read page ${change.after + 1}`);
        return {
          width: m.pdfium.getValue(ptr, "float"),
          height: m.pdfium.getValue(ptr + 4, "float"),
        };
      });
      const pagePtr = m.FPDFPage_New(docPtr, change.after + 1, width, height);
      if (!pagePtr) throw new Error("PDFium could not add a page");
      m.FPDF_ClosePage(pagePtr);
      return change.after + 1;
    }
    case "duplicatePage": {
      const source = openCopy(m, bytes);
      try {
        if (
          !(await importPages(
            docPtr,
            source.docPtr,
            String(change.page + 1),
            change.page + 1,
          ))
        )
          throw new Error("PDFium could not copy the page");
      } finally {
        closeCopy(m, source);
      }
      return change.page + 1;
    }
    case "deletePage": {
      if (count <= 1) throw new DocumentChangeRefused("lastPage");
      m.FPDFPage_Delete(docPtr, change.page);
      return Math.min(change.page, count - 2);
    }
    case "pageSetup": {
      const pages =
        change.pages === "all"
          ? Array.from({ length: count }, (_, i) => i)
          : [change.pages];
      for (const index of pages)
        withPage(m, docPtr, index, (pagePtr) => {
          const { width, height } = paperOf(m, pagePtr, change.size);
          const [w, h] =
            change.orientation === "landscape"
              ? [Math.max(width, height), Math.min(width, height)]
              : [Math.min(width, height), Math.max(width, height)];
          // A quarter-turned page shows its raw width as its height.
          const turned = m.FPDFPage_GetRotation(pagePtr) % 2 === 1;
          resizeKeepingTopLeft(m, pagePtr, turned ? h : w, turned ? w : h);
        });
      return change.pages === "all" ? (change.inView ?? 0) : change.pages;
    }
    case "addField":
      withPage(m, docPtr, change.page, (pagePtr) =>
        addField(m, docPtr, pagePtr, taken, change.field, change.x, change.y),
      );
      return change.page;
  }
}

function pageShiftOf(change: DocumentChange): PageShift {
  if (change.kind === "addPage") return { inserted: change.after + 1 };
  if (change.kind === "duplicatePage")
    return { inserted: change.page + 1, copyOf: change.page };
  if (change.kind === "deletePage") return { deleted: change.page };
  return null;
}

function paperOf(
  m: WrappedPdfiumModule,
  pagePtr: number,
  size: PageSizeName | "current",
): { width: number; height: number } {
  if (size !== "current") return PAGE_SIZES[size];
  const box = visibleBox(m, pagePtr);
  return { width: box.right - box.left, height: box.top - box.bottom };
}

// The page's own boxes miss one inherited from its parent; the bounding box
// is the effective crop box wherever it is set.
function visibleBox(m: WrappedPdfiumModule, pagePtr: number) {
  const box = withFloats(m, 4, (rect) =>
    m.FPDF_GetPageBoundingBox(pagePtr, rect)
      ? [0, 4, 8, 12].map((o) => m.pdfium.getValue(rect + o, "float"))
      : null,
  );
  if (!box) return readEffectivePageBox(m, pagePtr);
  const [a, b, c, d] = box;
  return {
    left: Math.min(a, c),
    right: Math.max(a, c),
    bottom: Math.min(b, d),
    top: Math.max(b, d),
  };
}

// Moves the page's boxes rather than its content, so annotations' every
// coordinate (QuadPoints, InkList, /L) stays on what it marks. The corner kept
// is the one the reader sees as top-left, which /Rotate moves round the box.
function resizeKeepingTopLeft(
  m: WrappedPdfiumModule,
  pagePtr: number,
  width: number,
  height: number,
) {
  const box = visibleBox(m, pagePtr);
  const left = [box.left, box.left, box.right - width, box.right - width];
  const bottom = [box.top - height, box.bottom, box.bottom, box.top - height];
  const quarter = ((m.FPDFPage_GetRotation(pagePtr) % 4) + 4) % 4;
  const x = left[quarter];
  const y = bottom[quarter];
  m.FPDFPage_SetMediaBox(pagePtr, x, y, x + width, y + height);
  m.FPDFPage_SetCropBox(pagePtr, x, y, x + width, y + height);
  // Print workflows size the page by these; left as they were they would
  // still describe the old paper.
  const boxes = [
    [m.FPDFPage_GetTrimBox, m.FPDFPage_SetTrimBox],
    [m.FPDFPage_GetBleedBox, m.FPDFPage_SetBleedBox],
    [m.FPDFPage_GetArtBox, m.FPDFPage_SetArtBox],
  ] as const;
  withFloats(m, 4, (rect) => {
    for (const [get, set] of boxes)
      if (get(pagePtr, rect, rect + 4, rect + 8, rect + 12))
        set(pagePtr, x, y, x + width, y + height);
  });
}
