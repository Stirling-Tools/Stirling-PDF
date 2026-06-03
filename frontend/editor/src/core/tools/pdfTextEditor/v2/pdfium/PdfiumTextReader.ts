import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { LineGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/LineGrouper";
import { ParagraphGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/ParagraphGrouper";
import type {
  Affine,
  GroupingMode,
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
  static populate(
    doc: EditorDocument,
    page: Page,
    mode: GroupingMode = "auto",
  ): void {
    if (page.loaded) return;
    const m = doc.module;
    // FPDFText_LoadPage / FPDFTextObj_GetText read the content stream.
    // Flush any deferred mutations so the populated runs reflect the
    // current edit state.
    page.flushGenerate(m);
    const pagePtr = page.pagePtr;
    const count = m.FPDFPage_CountObjects(pagePtr);

    const runs: TextRun[] = [];
    const images: ImageObject[] = [];

    // Recurse into form xobjects: InDesign/Quark wrap content in
    // FPDF_PAGEOBJ_FORM containers and the real text/images only show
    // up when we descend with FPDFFormObj_GetObject. The identity
    // transform accumulates each form's matrix so nested objects'
    // form-local bounds are lifted into page space.
    walkObjects(m, pagePtr, count, runs, images, doc, page, [], 0, IDENTITY);

    page.setRuns(runs);
    page.setImages(images);
    // LineGrouper always runs (merges per-glyph/per-word source objects
    // into one line). ParagraphGrouper only runs in "auto" mode, where
    // vertically-adjacent equal-spaced lines fold into one paragraph.
    LineGrouper.apply(page);
    if (mode === "auto") ParagraphGrouper.apply(page);
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
  transform: Affine,
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
      const run = readTextRun(m, doc, page, objPtr, indexId, transform);
      if (run) {
        run.containerPtr = containerPtr;
        run.topLevelContainerPtr = topLevelContainerPtr;
        runs.push(run);
      }
    } else if (type === FPDF_PAGEOBJ_IMAGE) {
      const indexId = [...path, i].join("-");
      const img = readImage(m, page, objPtr, indexId, transform);
      if (img) images.push(img);
    } else if (type === FPDF_PAGEOBJ_FORM && depth < MAX_DEPTH) {
      let formCount: number;
      try {
        formCount = formModule.FPDFFormObj_CountObjects(objPtr);
      } catch {
        formCount = 0;
      }
      if (formCount > 0) {
        // Compose the form's own matrix onto the running transform so
        // children's form-local coordinates resolve to page space.
        const childTransform = composeAffine(transform, readMatrix(m, objPtr));
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
          childTransform,
        );
      }
    }
  }
}

/** Identity affine - the page-level transform. */
const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * Compose two affines: returns `parent ∘ child` (child applied first,
 * then parent). PDF matrices map (x,y) -> (a·x + c·y + e, b·x + d·y + f).
 */
function composeAffine(parent: Affine, child: Affine): Affine {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f,
  };
}

/** Map a point through an affine. */
function applyAffine(
  t: Affine,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f };
}

/**
 * Transform an axis-aligned rect by an affine and return the new AABB
 * (all four corners mapped, then min/max).
 */
function transformRect(t: Affine, r: PageRect): PageRect {
  const c0 = applyAffine(t, r.x, r.y);
  const c1 = applyAffine(t, r.x + r.width, r.y);
  const c2 = applyAffine(t, r.x, r.y + r.height);
  const c3 = applyAffine(t, r.x + r.width, r.y + r.height);
  const xs = [c0.x, c1.x, c2.x, c3.x];
  const ys = [c0.y, c1.y, c2.y, c3.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/** True when the affine is (close to) the identity - skip work if so. */
function isIdentity(t: Affine): boolean {
  return (
    t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0
  );
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
  transform: Affine,
): TextRun | null {
  const textPagePtr = m.FPDFText_LoadPage(page.pagePtr);
  try {
    const text = readTextObjString(m, textPagePtr, objPtr);
    if (!text || text.length === 0) return null;

    const localBounds = readBounds(m, objPtr);
    if (!localBounds) return null;
    const localMatrix = readMatrix(m, objPtr);
    const fill = readFill(m, objPtr);

    // Lift form-local coordinates into page space. For page-level text
    // `transform` is identity and these are no-ops.
    const ident = isIdentity(transform);
    const bounds = ident ? localBounds : transformRect(transform, localBounds);
    const matrix = ident ? localMatrix : composeAffine(transform, localMatrix);

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
    // think in points, so we expose the product as the run's fontSize. Use
    // the PAGE-space (composed) matrix so a form's own scale is included -
    // otherwise a form-nested label reports its unscaled font size.
    const matrixScale =
      Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b) || 1;
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
  transform: Affine,
): ImageObject | null {
  const localBounds = readBounds(m, objPtr);
  if (!localBounds) return null;
  const localMatrix = readMatrix(m, objPtr);
  const ident = isIdentity(transform);
  return new ImageObject({
    id: `p${page.index}-i${index}`,
    pageIndex: page.index,
    pdfiumObjPtr: objPtr,
    bounds: ident ? localBounds : transformRect(transform, localBounds),
    matrix: ident ? localMatrix : composeAffine(transform, localMatrix),
  });
}
