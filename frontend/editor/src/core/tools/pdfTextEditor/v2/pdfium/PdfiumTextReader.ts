import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { LineGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/LineGrouper";
import { ParagraphGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/ParagraphGrouper";
import type {
  Affine,
  PageRect,
  RGBA,
} from "@app/tools/pdfTextEditor/v2/types";
import { readUtf16 } from "@app/services/pdfiumService";

/**
 * PDFium page-object type constants - mirrors `public/fpdf_edit.h`.
 *   FPDF_PAGEOBJ_UNKNOWN = 0
 *   FPDF_PAGEOBJ_TEXT    = 1
 *   FPDF_PAGEOBJ_PATH    = 2
 *   FPDF_PAGEOBJ_IMAGE   = 3
 *   FPDF_PAGEOBJ_SHADING = 4
 *   FPDF_PAGEOBJ_FORM    = 5
 */
const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_IMAGE = 3;
const FPDF_PAGEOBJ_FORM = 5;

/**
 * Reads the editable objects out of a PDFium page.
 *
 * The public entry point - `populate(doc, page)` - walks the page's object
 * list, extracts every text and image object's content, position, font,
 * and colour, and writes the resulting `TextRun` / `ImageObject` arrays
 * into the `Page`.
 */
export class PdfiumTextReader {
  static populate(doc: EditorDocument, page: Page): void {
    if (page.loaded) return;
    const m = doc.module;
    const pagePtr = page.pagePtr;
    const count = m.FPDFPage_CountObjects(pagePtr);

    const runs: TextRun[] = [];
    const images: ImageObject[] = [];

    // Recurse into form xobjects: InDesign/Quark wrap content in
    // FPDF_PAGEOBJ_FORM containers and the real text/images only show
    // up when we descend with FPDFFormObj_GetObject.
    walkObjects(m, pagePtr, count, runs, images, doc, page, [], 0);

    page.setRuns(runs);
    page.setImages(images);
    LineGrouper.apply(page);
    ParagraphGrouper.apply(page);
    page.loaded = true;
  }
}

/**
 * Walk a list of PDFium page objects, collecting text and image objects.
 * Recurses into form xobjects (FPDF_PAGEOBJ_FORM) via the experimental
 * `FPDFFormObj_*` APIs. The `path` array uniquely identifies nested
 * objects so we can give every TextRun a stable id even when two
 * different form xobjects emit text at the same page-level index.
 */
type PdfiumWithForms = WrappedPdfiumModule & {
  FPDFFormObj_CountObjects: (formObj: number) => number;
  FPDFFormObj_GetObject: (formObj: number, index: number) => number;
};

function walkObjects(
  m: WrappedPdfiumModule,
  pagePtr: number,
  count: number,
  runs: TextRun[],
  images: ImageObject[],
  doc: EditorDocument,
  page: Page,
  path: number[],
  depth: number,
): void {
  const MAX_DEPTH = 4;
  const formModule = m as PdfiumWithForms;
  // Container pointer for the current depth - either the page (path=[])
  // or the form xobject we're recursing into.
  const containerPtr =
    path.length === 0 ? 0 : getFormContainer(m, pagePtr, path);
  const topLevelContainerPtr =
    path.length === 0 ? 0 : m.FPDFPage_GetObject(pagePtr, path[0]);
  for (let i = 0; i < count; i++) {
    const objPtr =
      path.length === 0
        ? m.FPDFPage_GetObject(pagePtr, i)
        : formModule.FPDFFormObj_GetObject(containerPtr, i);
    if (!objPtr) continue;
    const type = m.FPDFPageObj_GetType(objPtr);
    if (type === FPDF_PAGEOBJ_TEXT) {
      const indexId = [...path, i].join("-");
      const run = readTextRun(m, doc, page, objPtr, indexId);
      if (run) {
        run.containerPtr = containerPtr;
        run.topLevelContainerPtr = topLevelContainerPtr;
        runs.push(run);
      }
    } else if (type === FPDF_PAGEOBJ_IMAGE) {
      const indexId = [...path, i].join("-");
      const img = readImage(m, page, objPtr, indexId);
      if (img) images.push(img);
    } else if (type === FPDF_PAGEOBJ_FORM && depth < MAX_DEPTH) {
      let formCount: number;
      try {
        formCount = formModule.FPDFFormObj_CountObjects(objPtr);
      } catch {
        formCount = 0;
      }
      if (formCount > 0) {
        walkObjects(
          m,
          pagePtr,
          formCount,
          runs,
          images,
          doc,
          page,
          [...path, i],
          depth + 1,
        );
      }
    }
  }
}

/**
 * Re-walk to the form container at the given index path so the recursive
 * call can index its children. PDFium doesn't expose a parent pointer so
 * we replay the path from the root each time.
 */
function getFormContainer(
  m: WrappedPdfiumModule,
  pagePtr: number,
  path: number[],
): number {
  const formModule = m as PdfiumWithForms;
  let current = m.FPDFPage_GetObject(pagePtr, path[0]);
  for (let i = 1; i < path.length; i++) {
    current = formModule.FPDFFormObj_GetObject(current, path[i]);
  }
  return current;
}

function readBounds(m: WrappedPdfiumModule, objPtr: number): PageRect | null {
  const lPtr = m.pdfium.wasmExports.malloc(4);
  const bPtr = m.pdfium.wasmExports.malloc(4);
  const rPtr = m.pdfium.wasmExports.malloc(4);
  const tPtr = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(objPtr, lPtr, bPtr, rPtr, tPtr)) return null;
    const left = m.pdfium.getValue(lPtr, "float");
    const bottom = m.pdfium.getValue(bPtr, "float");
    const right = m.pdfium.getValue(rPtr, "float");
    const top = m.pdfium.getValue(tPtr, "float");
    return {
      x: Math.min(left, right),
      y: Math.min(bottom, top),
      width: Math.abs(right - left),
      height: Math.abs(top - bottom),
    };
  } finally {
    m.pdfium.wasmExports.free(lPtr);
    m.pdfium.wasmExports.free(bPtr);
    m.pdfium.wasmExports.free(rPtr);
    m.pdfium.wasmExports.free(tPtr);
  }
}

function readMatrix(m: WrappedPdfiumModule, objPtr: number): Affine {
  // FS_MATRIX: { a, b, c, d, e, f } as floats.
  const buf = m.pdfium.wasmExports.malloc(6 * 4);
  try {
    const ok = m.FPDFPageObj_GetMatrix(objPtr, buf);
    if (!ok) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    return {
      a: m.pdfium.getValue(buf, "float"),
      b: m.pdfium.getValue(buf + 4, "float"),
      c: m.pdfium.getValue(buf + 8, "float"),
      d: m.pdfium.getValue(buf + 12, "float"),
      e: m.pdfium.getValue(buf + 16, "float"),
      f: m.pdfium.getValue(buf + 20, "float"),
    };
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function readFill(m: WrappedPdfiumModule, objPtr: number): RGBA {
  const r = m.pdfium.wasmExports.malloc(4);
  const g = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const a = m.pdfium.wasmExports.malloc(4);
  try {
    const ok = m.FPDFPageObj_GetFillColor(objPtr, r, g, b, a);
    if (!ok) return { r: 0, g: 0, b: 0, a: 255 };
    return {
      r: m.pdfium.getValue(r, "i32") & 0xff,
      g: m.pdfium.getValue(g, "i32") & 0xff,
      b: m.pdfium.getValue(b, "i32") & 0xff,
      a: m.pdfium.getValue(a, "i32") & 0xff,
    };
  } finally {
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(g);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(a);
  }
}

function readTextObjString(
  m: WrappedPdfiumModule,
  textPagePtr: number,
  objPtr: number,
): string {
  // First call returns size in bytes for the UTF-16 buffer (including NUL).
  const len = m.FPDFTextObj_GetText(objPtr, textPagePtr, 0, 0);
  if (len <= 2) return "";
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    m.FPDFTextObj_GetText(objPtr, textPagePtr, buf, len);
    return readUtf16(m, buf, len);
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function readFontFamily(
  m: WrappedPdfiumModule,
  fontPtr: number,
): { family: string; subset: boolean } {
  if (!fontPtr) return { family: "Unknown", subset: false };
  const len = m.FPDFFont_GetFamilyName(fontPtr, 0, 0);
  if (len <= 1) return { family: "Unknown", subset: false };
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    m.FPDFFont_GetFamilyName(fontPtr, buf, len);
    const raw = m.pdfium.UTF8ToString(buf);
    // PDFium prefixes subset font names with a 6-letter tag + "+".
    const subset = /^[A-Z]{6}\+/.test(raw);
    const family = subset ? raw.slice(7) : raw;
    return { family, subset };
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function readTextRun(
  m: WrappedPdfiumModule,
  _doc: EditorDocument,
  page: Page,
  objPtr: number,
  index: number | string,
): TextRun | null {
  const textPagePtr = m.FPDFText_LoadPage(page.pagePtr);
  try {
    const text = readTextObjString(m, textPagePtr, objPtr);
    if (!text || text.length === 0) return null;

    const bounds = readBounds(m, objPtr);
    if (!bounds) return null;
    const matrix = readMatrix(m, objPtr);
    const fill = readFill(m, objPtr);

    const sizePtr = m.pdfium.wasmExports.malloc(4);
    let rawFontSize = 12;
    try {
      if (m.FPDFTextObj_GetFontSize(objPtr, sizePtr)) {
        rawFontSize = m.pdfium.getValue(sizePtr, "float");
      }
    } finally {
      m.pdfium.wasmExports.free(sizePtr);
    }
    // The on-page visible font size is `rawFontSize * |matrix scale|`. PDFium
    // encodes the size split between a unit font and a scaling matrix; users
    // think in points, so we expose the product as the run's fontSize.
    const matrixScale = Math.sqrt(
      matrix.a * matrix.a + matrix.b * matrix.b,
    ) || 1;
    const fontSize = rawFontSize * matrixScale;

    const fontPtr = m.FPDFTextObj_GetFont(objPtr);
    const { family, subset } = readFontFamily(m, fontPtr);
    // Treat the PDFium font handle pointer as a unique id within the doc.
    const fontId = fontPtr ? `pdf:${fontPtr}` : `pdf:unknown-${index}`;

    return new TextRun({
      id: `p${page.index}-t${index}`,
      pageIndex: page.index,
      pdfiumObjPtr: objPtr,
      bounds,
      matrix,
      text,
      fontId: `${fontId}:${family}`,
      fontSize,
      fill,
      fontSubset: subset,
    });
  } finally {
    m.FPDFText_ClosePage(textPagePtr);
  }
}

function readImage(
  m: WrappedPdfiumModule,
  page: Page,
  objPtr: number,
  index: number | string,
): ImageObject | null {
  const bounds = readBounds(m, objPtr);
  if (!bounds) return null;
  const matrix = readMatrix(m, objPtr);
  return new ImageObject({
    id: `p${page.index}-i${index}`,
    pageIndex: page.index,
    pdfiumObjPtr: objPtr,
    bounds,
    matrix,
  });
}
