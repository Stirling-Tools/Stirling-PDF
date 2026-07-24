import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { LineGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/LineGrouper";
import { ParagraphGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/ParagraphGrouper";
import { primeFontGlyphMap } from "@app/tools/pdfTextEditor/v2/charcode/CmapResolver";
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

    // ONE text page for the whole walk: FPDFText_LoadPage runs full page
    // text extraction, so opening it per text object made population
    // O(objects x page chars) - seconds of frozen UI on dense pages.
    const textPagePtr = m.FPDFText_LoadPage(pagePtr);
    try {
      // Recurse into form xobjects: InDesign/Quark wrap content in
      // FPDF_PAGEOBJ_FORM containers and the real text/images only show
      // up when we descend with FPDFFormObj_GetObject. The identity
      // transform accumulates each form's matrix so nested objects'
      // form-local bounds are lifted into page space.
      walkObjects(
        m,
        pagePtr,
        count,
        runs,
        images,
        doc,
        page,
        [],
        0,
        IDENTITY,
        textPagePtr,
      );

      page.setRuns(runs);
      page.setImages(images);
      // LineGrouper always runs (merges per-glyph/per-word source objects
      // into one line). ParagraphGrouper only runs in "auto" mode, where
      // vertically-adjacent equal-spaced lines fold into one paragraph.
      LineGrouper.apply(page);
      if (mode === "auto") ParagraphGrouper.apply(page);
      // Grouping is done, the text page is still open: infer each run's
      // effective letter-spacing from its rendered char geometry so edits
      // can reproduce the tracking (PDFium exposes no Tc getter).
      inferRunCharSpacing(m, page, textPagePtr);
    } finally {
      m.FPDFText_ClosePage(textPagePtr);
    }
    page.loaded = true;
  }
}

/**
 * Infer each run's effective character spacing (the rendered footprint of the
 * PDF's Tc operator) from on-page char geometry: for consecutive text-page
 * chars inside one run, `extra = nextOrigin.x - origin.x - glyphAdvance`. The
 * loose char box excludes Tc while origin deltas include it, so the median
 * `extra` over the run's letter pairs recovers Tc in page points regardless
 * of how the producer split size between Tf and the text matrix.
 *
 * Median (not mean) so kerning-pair adjustments and the odd outlier don't
 * skew the estimate. Whitespace-adjacent pairs are excluded (word spacing Tw
 * would contaminate them), as are pairs spanning different runs. Rotated runs
 * are skipped - the axis-aligned box math doesn't apply. Runs with fewer than
 * two usable pairs, or a sub-noise median, keep spacing 0 (status quo).
 */
function inferRunCharSpacing(
  m: WrappedPdfiumModule,
  page: Page,
  textPagePtr: number,
): void {
  const runs = page.runs;
  if (runs.length === 0) return;
  // Map every backing object ptr to its (post-grouping) rep run.
  const ptrToRun = new Map<number, TextRun>();
  for (const run of runs) {
    const members =
      run.paragraphLeafPtrs.length > 0
        ? run.paragraphLeafPtrs
        : run.mergedFromPtrs.length > 0
          ? run.mergedFromPtrs
          : [run.pdfiumObjPtr];
    for (const ptr of members) if (ptr) ptrToRun.set(ptr, run);
  }

  const charCount = m.FPDFText_CountChars(textPagePtr);
  if (charCount <= 1) return;
  const wasm = m.pdfium.wasmExports;
  const rectBuf = wasm.malloc(16); // FS_RECT: 4 floats {l, t, r, b}
  const samples = new Map<TextRun, number[]>();
  try {
    const looseMod = m as unknown as {
      FPDFText_GetLooseCharBox?: (
        tp: number,
        i: number,
        rect: number,
      ) => boolean;
    };
    if (!looseMod.FPDFText_GetLooseCharBox) return;
    const heap = (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
    let prev: {
      run: TextRun;
      left: number;
      right: number;
      bottom: number;
    } | null = null;
    for (let i = 0; i < charCount; i++) {
      const cp = m.FPDFText_GetUnicode(textPagePtr, i);
      const isWs = !cp || cp <= 0x20 || cp === 0xa0;
      const objPtr = m.FPDFText_GetTextObject(textPagePtr, i);
      const run = objPtr ? ptrToRun.get(objPtr) : undefined;
      if (isWs) {
        // A REAL space glyph (belongs to a text object) ends the pair chain -
        // pairs across it would fold word spacing (Tw) into the estimate. A
        // SYNTHESIZED space (no backing object in any run - PDFium inserts
        // these between per-glyph objects whose letter-spaced gaps look
        // space-like) is transparent: the letters on either side still form
        // a pair, with the word-gap guard below rejecting genuine gaps. This
        // keeps inference working on documents whose spaced runs are built
        // from one object per char - including our own re-emits.
        if (run) prev = null;
        continue;
      }
      if (!run) {
        prev = null;
        continue;
      }
      if (!looseMod.FPDFText_GetLooseCharBox(textPagePtr, i, rectBuf)) {
        prev = null;
        continue;
      }
      const f = new Float32Array(heap.buffer, rectBuf, 4);
      const cur = { run, left: f[0], right: f[2], bottom: f[3] };
      if (prev && prev.run === run) {
        const advance = prev.right - prev.left;
        const delta = cur.left - prev.left;
        const extra = delta - advance;
        // Same visual line, forward advance only, and NOT a word gap: real
        // letter-spacing stays well under ~0.6em, while an inter-word gap
        // (space advance + spacing) lands above it.
        if (
          delta > 0 &&
          advance > 0 &&
          extra < run.fontSize * 0.6 &&
          Math.abs(cur.bottom - prev.bottom) < Math.max(1, run.fontSize * 0.25)
        ) {
          let arr = samples.get(run);
          if (!arr) {
            arr = [];
            samples.set(run, arr);
          }
          arr.push(extra);
        }
      }
      prev = cur;
    }
  } finally {
    wasm.free(rectBuf);
  }

  for (const [run, extras] of samples) {
    if (extras.length < 2) continue;
    // Upright runs only - the box math above is axis-aligned.
    const scale = Math.hypot(run.matrix.a, run.matrix.b);
    if (!scale || Math.abs(run.matrix.b) / scale > 0.02 || run.matrix.a <= 0) {
      continue;
    }
    const sorted = [...extras].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // Noise floor: kerning tweaks and float fuzz stay well under 2% of the
    // font size; a real Tc (like a spaced-caps heading) is far above it.
    const noise = Math.max(0.25, run.fontSize * 0.02);
    if (Math.abs(median) < noise) continue;
    // Sanity cap - a broken measurement must not explode the layout.
    if (Math.abs(median) > run.fontSize * 2) continue;
    run.charSpacingPt = median;
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
  textPagePtr: number,
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
      const run = readTextRun(
        m,
        doc,
        page,
        objPtr,
        indexId,
        transform,
        textPagePtr,
      );
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
          textPagePtr,
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

/** 6-letter "ABCDEF+" subset tag PDFium prefixes onto subset font names. */
const SUBSET_TAG_RE = /^[A-Z]{6}\+/;

/** Read a UTF-8 font name via an FPDFFont_Get*Name accessor (null if empty). */
function readFontNameVia(
  m: WrappedPdfiumModule,
  fontPtr: number,
  getName: (font: number, buf: number, len: number) => number,
): string | null {
  const len = getName(fontPtr, 0, 0);
  if (len <= 1) return null;
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    getName(fontPtr, buf, len);
    return m.pdfium.UTF8ToString(buf);
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function readFontFamily(
  m: WrappedPdfiumModule,
  fontPtr: number,
): { family: string; subset: boolean } {
  if (!fontPtr) return { family: "Unknown", subset: false };
  const familyRaw = readFontNameVia(m, fontPtr, m.FPDFFont_GetFamilyName);
  if (familyRaw == null) return { family: "Unknown", subset: false };
  const tagged = SUBSET_TAG_RE.test(familyRaw);
  const family = tagged ? familyRaw.slice(7) : familyRaw;
  if (tagged) return { family, subset: true };
  // Some PDFs carry the 6-letter subset tag only on /BaseFont, not the
  // embedded name table. Consult it as a fallback so those subsets aren't
  // mislabeled as full fonts (which would wrongly let an edit reuse a font
  // that lacks most glyphs).
  const baseRaw = readFontNameVia(m, fontPtr, m.FPDFFont_GetBaseFontName);
  return { family, subset: baseRaw != null && SUBSET_TAG_RE.test(baseRaw) };
}

function readTextRun(
  m: WrappedPdfiumModule,
  _doc: EditorDocument,
  page: Page,
  objPtr: number,
  index: number | string,
  transform: Affine,
  textPagePtr: number,
): TextRun | null {
  {
    const text = readTextObjString(m, textPagePtr, objPtr);
    if (!text || text.length === 0) return null;
    // Whitespace-only objects (positional space glyphs) would surface as
    // invisible, selectable, editable ghost runs - skip them. The PDF
    // objects themselves stay untouched.
    if (text.trim().length === 0) return null;

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
    // Prime this font's glyph cmap here, in the loader's SERIALIZED text-read
    // phase (before the page rasterizes). Reading embedded font data while
    // PDFium renders corrupts the module, so the fonts panel must never do it
    // at render time - it reads the cache primed here instead. Cached per font,
    // so repeats across runs are free.
    if (fontPtr) primeFontGlyphMap(fontPtr, m);
    // Treat the PDFium font handle pointer as a unique id within the doc.
    const fontId = fontPtr ? `pdf:${fontPtr}` : `pdf:unknown-${index}`;

    // Text render mode (PDF Tr): 0 fill (default), 1/2 stroke variants,
    // 3 invisible (OCR text layers over scans), 4-7 clipping variants.
    // Captured so re-emits can re-apply it - otherwise editing invisible
    // OCR text stamps VISIBLE glyphs over the scan.
    let renderMode = 0;
    const rm = (
      m as unknown as {
        FPDFTextObj_GetTextRenderMode?: (obj: number) => number;
      }
    ).FPDFTextObj_GetTextRenderMode;
    if (rm) {
      try {
        const v = rm(objPtr);
        if (Number.isInteger(v) && v >= 0 && v <= 7) renderMode = v;
      } catch {
        /* keep default */
      }
    }

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
      renderMode,
    });
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
