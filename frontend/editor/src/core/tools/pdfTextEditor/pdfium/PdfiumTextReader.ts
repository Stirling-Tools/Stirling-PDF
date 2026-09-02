import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { ImageObject } from "@app/tools/pdfTextEditor/model/ImageObject";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { LineGrouper } from "@app/tools/pdfTextEditor/pdfium/LineGrouper";
import { ParagraphGrouper } from "@app/tools/pdfTextEditor/pdfium/ParagraphGrouper";
import { PdfiumAnnotationReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumAnnotationReader";
import { primeFontGlyphMap } from "@app/tools/pdfTextEditor/charcode/CmapResolver";
import type {
  Affine,
  GroupingMode,
  PageRect,
  PageRuleSnapshot,
  RGBA,
} from "@app/tools/pdfTextEditor/types";
import { readUtf16 } from "@app/services/pdfiumService";
import { registerEmbeddedFace } from "@app/tools/pdfTextEditor/util/embeddedFace";

/** PDFium page-object type constants - mirrors `public/fpdf_edit.h`. */
const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_PATH = 2;
const FPDF_PAGEOBJ_IMAGE = 3;
const FPDF_PAGEOBJ_FORM = 5;

// A ruling line is hairline-thin on one axis and long on the other. Anything
// squarer is a box, a shading or a glyph-like drawing.
const RULE_MAX_THICKNESS_PT = 3;
const RULE_MIN_LENGTH_PT = 6;
// fpdf_edit.h path segment types.
const SEG_LINETO = 0;
const SEG_MOVETO = 2;

/** Reads the editable objects out of a PDFium page. */
export class PdfiumTextReader {
  static populate(
    doc: EditorDocument,
    page: Page,
    mode: GroupingMode = "auto",
  ): void {
    if (page.loaded) return;
    const m = doc.module;
    const pagePtr = page.pagePtr;
    const count = m.FPDFPage_CountObjects(pagePtr);

    const runs: TextRun[] = [];
    const images: ImageObject[] = [];
    const rules: PageRuleSnapshot[] = [];
    const fills: PageRuleSnapshot[] = [];

    // ONE text page for the whole walk: FPDFText_LoadPage runs full page text
    // extraction, so opening it per text object made population O.
    const textPagePtr = m.FPDFText_LoadPage(pagePtr);
    try {
      // Recurse into form xobjects: InDesign/Quark wrap content in
      // FPDF_PAGEOBJ_FORM containers and the real text/images only show up.
      walkObjects(
        m,
        pagePtr,
        count,
        runs,
        images,
        rules,
        fills,
        doc,
        page,
        [],
        0,
        IDENTITY,
        textPagePtr,
      );

      page.setRuns(runs);
      page.setImages(images);
      page.setRules(rules);
      page.setFills(fills);
      // Annotation text is drawn by FPDF_ANNOT but lives outside the object
      // tree, so record the boxes to explain why it can't be edited.
      PdfiumAnnotationReader.populate(m, page);
      // LineGrouper always runs (merges per-glyph/per-word source objects into
      // one line).
      LineGrouper.apply(page);
      if (mode === "auto") ParagraphGrouper.apply(page);
      // Grouping is done.
      // One walk feeds both: each was reading the same characters with its
      // own WASM round-trips, doubling the cost of every page read.
      const geometry = collectCharGeometry(m, page, textPagePtr);
      if (geometry) {
        inferRunCharSpacing(page, geometry);
        captureCharPositions(geometry);
      }
    } finally {
      m.FPDFText_ClosePage(textPagePtr);
    }
    page.loaded = true;
  }

  // Returns the runs whose captured positions actually moved, so the caller
  // can re-snapshot just those instead of re-rendering every overlay per tick.
  static recapturePositions(doc: EditorDocument, page: Page): Set<TextRun> {
    const m = doc.module;
    if (!page.loaded || page.runs.length === 0) return new Set();
    // No flush: like FPDF_RenderPageBitmap, FPDFText_LoadPage walks the live
    // object list. Regenerating here cost ~1s per keystroke on Firefox and is
    // what save/repopulate do anyway.
    const textPagePtr = m.FPDFText_LoadPage(page.pagePtr);
    if (!textPagePtr) return new Set();
    try {
      const geometry = collectCharGeometry(m, page, textPagePtr);
      return geometry ? captureCharPositions(geometry) : new Set();
    } finally {
      m.FPDFText_ClosePage(textPagePtr);
    }
  }
}

/** Every backing PDFium object pointer mapped to its post-grouping run. */
function indexRunsByObjectPtr(runs: TextRun[]): Map<number, TextRun> {
  const map = new Map<number, TextRun>();
  for (const run of runs) {
    const members =
      run.paragraphLeafPtrs.length > 0
        ? run.paragraphLeafPtrs
        : run.mergedFromPtrs.length > 0
          ? run.mergedFromPtrs
          : [run.pdfiumObjPtr];
    for (const ptr of members) if (ptr) map.set(ptr, run);
  }
  return map;
}

// Infer each run's effective character spacing from on-page char geometry: for
// consecutive text-page chars inside one run, `extra = nextOrigin.x - origin.x.
interface CharGeometry {
  cp: number;
  run: TextRun | null;
  /** False when the engine could not give this character a box. */
  ok: boolean;
  left: number;
  right: number;
  bottom: number;
  originX: number;
}

// Read every character's geometry once. Both consumers below need the same
// characters, so doing this twice was pure duplicated WASM traffic.
function collectCharGeometry(
  m: WrappedPdfiumModule,
  page: Page,
  textPagePtr: number,
): CharGeometry[] | null {
  if (page.runs.length === 0) return null;
  const probe = m as unknown as {
    FPDFText_GetLooseCharBox?: (tp: number, i: number, rect: number) => boolean;
    FPDFText_GetCharOrigin?: (
      tp: number,
      i: number,
      x: number,
      y: number,
    ) => boolean;
  };
  if (!probe.FPDFText_GetLooseCharBox) return null;
  const charCount = m.FPDFText_CountChars(textPagePtr);
  if (charCount <= 1) return null;

  const ptrToRun = indexRunsByObjectPtr(page.runs);
  const wasm = m.pdfium.wasmExports;
  const rectBuf = wasm.malloc(16); // FS_RECT: 4 floats {l, t, r, b}
  const xPtr = wasm.malloc(8);
  const yPtr = wasm.malloc(8);
  const out: CharGeometry[] = [];
  try {
    for (let i = 0; i < charCount; i += 1) {
      const cp = m.FPDFText_GetUnicode(textPagePtr, i);
      const objPtr = m.FPDFText_GetTextObject(textPagePtr, i);
      const run = objPtr ? (ptrToRun.get(objPtr) ?? null) : null;
      const boxed = probe.FPDFText_GetLooseCharBox(textPagePtr, i, rectBuf);
      const heap = (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
      const f = new Float32Array(heap.buffer, rectBuf, 4);
      let originX = Number.NaN;
      if (probe.FPDFText_GetCharOrigin?.(textPagePtr, i, xPtr, yPtr)) {
        originX = m.pdfium.getValue(xPtr, "double");
      }
      out.push({
        cp,
        run,
        ok: boxed,
        left: boxed ? f[0] : Number.NaN,
        right: boxed ? f[2] : Number.NaN,
        bottom: boxed ? f[3] : Number.NaN,
        originX,
      });
    }
  } finally {
    wasm.free(rectBuf);
    wasm.free(xPtr);
    wasm.free(yPtr);
  }
  return out;
}

function inferRunCharSpacing(page: Page, geometry: CharGeometry[]): void {
  if (page.runs.length === 0) return;
  const samples = new Map<TextRun, number[]>();
  let prev: {
    run: TextRun;
    left: number;
    right: number;
    bottom: number;
  } | null = null;
  for (const g of geometry) {
    const isWs = !g.cp || g.cp <= 0x20 || g.cp === 0xa0;
    if (isWs) {
      // A REAL space glyph (belongs to a text object) ends the pair chain -
      // pairs across it would fold word spacing (Tw) into the estimate.
      if (g.run) prev = null;
      continue;
    }
    if (!g.run || !g.ok) {
      prev = null;
      continue;
    }
    const run = g.run;
    const cur = { run, left: g.left, right: g.right, bottom: g.bottom };
    if (prev && prev.run === run) {
      const advance = prev.right - prev.left;
      const delta = cur.left - prev.left;
      const extra = delta - advance;
      // Same visual line, forward advance only, and NOT a word gap: real
      // letter-spacing stays well under ~0.6em.
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

/** NaN-safe element-wise equality for captured position arrays. */
function samePositions(prev: number[] | null, next: number[]): boolean {
  if (!prev || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (!Object.is(prev[i], next[i])) return false;
  }
  return true;
}

// Record where the engine put every glyph, indexed by code unit of `text`.
// Both units of a surrogate pair share a value; synthesised spaces stay NaN.
function captureCharPositions(geometry: CharGeometry[]): Set<TextRun> {
  const glyphs = new Map<
    TextRun,
    Array<{ cp: number; x: number; end: number }>
  >();
  for (const g of geometry) {
    if (!g.run || !g.cp || !g.ok) continue;
    if (!Number.isFinite(g.originX) || g.right < g.originX) continue;
    let list = glyphs.get(g.run);
    if (!list) {
      list = [];
      glyphs.set(g.run, list);
    }
    // The loose box's right edge is the pen position after the glyph, which
    // is what makes consecutive word boxes tile without drift.
    list.push({ cp: g.cp, x: g.originX, end: g.right });
  }

  const changed = new Set<TextRun>();
  for (const [run, list] of glyphs) {
    // Upright runs only: an origin's X is the advance direction only when the
    // baseline is horizontal.
    const scale = Math.hypot(run.matrix.a, run.matrix.b);
    if (!scale || Math.abs(run.matrix.b) / scale > 0.02 || run.matrix.a <= 0) {
      continue;
    }
    const aligned = alignToText(run.text, list);
    if (!aligned) continue;
    // Same positions under a still-current key is a no-op capture; skipping it
    // keeps untouched runs' snapshots stable across the periodic tick.
    if (
      samePositions(run.charStartsX, aligned.starts) &&
      samePositions(run.charEndsX, aligned.ends) &&
      run.charPositionsKey === run.positionsKey()
    ) {
      continue;
    }
    run.charStartsX = aligned.starts;
    run.charEndsX = aligned.ends;
    run.charPositionsKey = run.positionsKey();
    changed.add(run);
  }
  return changed;
}

// Line up the engine's glyph list with the run's text - they are not
// index-for-index, and anything unplaceable is left unknown, not guessed.
function alignToText(
  text: string,
  glyphs: Array<{ cp: number; x: number; end: number }>,
): { starts: number[]; ends: number[] } | null {
  const starts = new Array<number>(text.length).fill(Number.NaN);
  const ends = new Array<number>(text.length).fill(Number.NaN);
  let g = 0;
  let placed = 0;
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i) ?? 0;
    const units = cp > 0xffff ? 2 : 1;
    if (g < glyphs.length && glyphs[g].cp === cp) {
      for (let u = 0; u < units; u += 1) {
        starts[i + u] = glyphs[g].x;
        ends[i + u] = glyphs[g].end;
      }
      g += 1;
      placed += 1;
    } else if (g < glyphs.length && cp !== 0x20 && cp !== 0x0a) {
      // The text has a character the glyph list does not: look at the next
      // couple of glyphs only, so a long mismatching run stays linear.
      let next = -1;
      for (let at = g + 1; at <= g + 2 && at < glyphs.length; at += 1) {
        if (glyphs[at].cp === cp) {
          next = at;
          break;
        }
      }
      if (next > 0) {
        g = next;
        continue;
      }
    }
    i += units;
  }
  // A capture that placed almost nothing is not worth trusting.
  const visible = [...text].filter((c) => !/\s/.test(c)).length;
  return placed >= Math.max(1, Math.floor(visible * 0.6))
    ? { starts, ends }
    : null;
}

/** Walk a list of PDFium page objects, collecting text and image objects. */
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
  rules: PageRuleSnapshot[],
  fills: PageRuleSnapshot[],
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
    } else if (type === FPDF_PAGEOBJ_PATH) {
      const painted = readRules(m, objPtr, transform);
      if (painted.length > 0) rules.push(...painted);
      else {
        const fill = readAreaFill(m, objPtr, transform);
        if (fill) fills.push(fill);
      }
    } else if (type === FPDF_PAGEOBJ_IMAGE) {
      const indexId = [...path, i].join("-");
      const img = readImage(m, page, objPtr, indexId, transform, containerPtr);
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
          rules,
          fills,
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

// Compose two affines: returns `parent ∘ child` (child applied first, then
// parent).
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

// Transform an axis-aligned rect by an affine and return the new AABB (all four
// corners mapped, then min/max).
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

// Re-walk to the form container at the given index path so the recursive call
// can index its children.
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

// The ruling lines a path object draws.
//
// A table's grid reaches us in three encodings: one thin filled rect per line
// (the object's own box is the line), one stroked rectangle per cell or row,
// and a single path whose subpaths are every line on the page. Only the first
// is readable from the bounding box, so the axis-aligned edges are walked out
// of the path itself and each is tested on its own.
function readRules(
  m: WrappedPdfiumModule,
  objPtr: number,
  transform: Affine,
): PageRuleSnapshot[] {
  const paint = readPaint(m, objPtr);
  if (!paint) return [];
  const decorate = (rects: PageRect[]): PageRuleSnapshot[] =>
    rects.map((rect) => ({
      ...rect,
      ptr: objPtr,
      thickness: paint.thickness || Math.min(rect.width, rect.height),
      color: paint.color,
    }));
  // Only a STROKED path draws its outline as lines. A filled box is a shape -
  // decomposing it would turn a header's shading into four phantom rules and
  // invite the editor to delete the shading when it takes over the grid.
  if (paint.stroked) {
    const matrix = composeAffine(transform, readMatrix(m, objPtr));
    const edges = ruleEdgesFromPath(m, objPtr, matrix);
    if (edges.length > 0) return decorate(edges);
  }
  const local = readBounds(m, objPtr);
  if (!local) return [];
  const rect = isIdentity(transform) ? local : transformRect(transform, local);
  return isRuleShaped(rect) ? decorate([rect]) : [];
}

// A filled area that is not a line: a row's shading, a cell's highlight. Kept
// so a table the editor takes over can carry its background when it changes
// shape, instead of leaving new cells unpainted.
function readAreaFill(
  m: WrappedPdfiumModule,
  objPtr: number,
  transform: Affine,
): PageRuleSnapshot | null {
  const paint = readPaint(m, objPtr);
  if (!paint || paint.stroked) return null;
  const local = readBounds(m, objPtr);
  if (!local) return null;
  const rect = isIdentity(transform) ? local : transformRect(transform, local);
  if (rect.width < RULE_MIN_LENGTH_PT || rect.height < RULE_MIN_LENGTH_PT) {
    return null;
  }
  return { ...rect, ptr: objPtr, thickness: 0, color: paint.color };
}

interface RulePaint {
  stroked: boolean;
  thickness: number;
  color: RGBA;
}

// What a path paints, or null when it paints nothing (a clip, or a leftover).
function readPaint(m: WrappedPdfiumModule, objPtr: number): RulePaint | null {
  const fillPtr = m.pdfium.wasmExports.malloc(4);
  const strokePtr = m.pdfium.wasmExports.malloc(4);
  let fillMode = 1;
  let stroked = false;
  try {
    if (m.FPDFPath_GetDrawMode(objPtr, fillPtr, strokePtr)) {
      fillMode = m.pdfium.getValue(fillPtr, "i32");
      stroked = m.pdfium.getValue(strokePtr, "i32") !== 0;
    }
  } catch {
    // Older builds without the accessor: assume it paints.
  } finally {
    m.pdfium.wasmExports.free(fillPtr);
    m.pdfium.wasmExports.free(strokePtr);
  }
  if (fillMode === 0 && !stroked) return null;
  const mod = m as unknown as RulePaintModule;
  const read = stroked
    ? mod.FPDFPageObj_GetStrokeColor
    : mod.FPDFPageObj_GetFillColor;
  const color = read ? readRGBA(m, objPtr, read) : null;
  return {
    stroked,
    thickness: stroked ? readStrokeWidth(m, objPtr) : 0,
    color: color ?? { r: 0, g: 0, b: 0, a: 255 },
  };
}

interface RulePaintModule {
  FPDFPageObj_GetStrokeColor?: ColorReader;
  FPDFPageObj_GetFillColor?: ColorReader;
  FPDFPageObj_GetStrokeWidth?: (obj: number, w: number) => boolean | number;
}

type ColorReader = (
  obj: number,
  r: number,
  g: number,
  b: number,
  a: number,
) => boolean | number;

function readRGBA(
  m: WrappedPdfiumModule,
  objPtr: number,
  read: ColorReader,
): RGBA | null {
  const r = m.pdfium.wasmExports.malloc(4);
  const g = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const a = m.pdfium.wasmExports.malloc(4);
  try {
    if (!read(objPtr, r, g, b, a)) return null;
    return {
      r: m.pdfium.getValue(r, "i32") & 0xff,
      g: m.pdfium.getValue(g, "i32") & 0xff,
      b: m.pdfium.getValue(b, "i32") & 0xff,
      a: m.pdfium.getValue(a, "i32") & 0xff,
    };
  } catch {
    return null;
  } finally {
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(g);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(a);
  }
}

function readStrokeWidth(m: WrappedPdfiumModule, objPtr: number): number {
  const get = (m as unknown as RulePaintModule).FPDFPageObj_GetStrokeWidth;
  if (!get) return 0;
  const w = m.pdfium.wasmExports.malloc(4);
  try {
    if (!get(objPtr, w)) return 0;
    const raw = m.pdfium.getValue(w, "float");
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  } finally {
    m.pdfium.wasmExports.free(w);
  }
}

function isRuleShaped(rect: PageRect): boolean {
  return (
    Math.min(rect.width, rect.height) <= RULE_MAX_THICKNESS_PT &&
    Math.max(rect.width, rect.height) >= RULE_MIN_LENGTH_PT
  );
}

// Axis-aligned straight edges of a path, each as a thin rect. Covers a stroked
// rectangle (four edges) and a multi-subpath grid (every line at once).
function ruleEdgesFromPath(
  m: WrappedPdfiumModule,
  objPtr: number,
  matrix: Affine,
): PageRect[] {
  let count: number;
  try {
    count = m.FPDFPath_CountSegments(objPtr);
  } catch {
    return [];
  }
  // A one- or two-point path has no edge a bounding box would not already give.
  if (count < 3) return [];
  const xPtr = m.pdfium.wasmExports.malloc(4);
  const yPtr = m.pdfium.wasmExports.malloc(4);
  const out: PageRect[] = [];
  try {
    let prev: { x: number; y: number } | null = null;
    let subpathStart: { x: number; y: number } | null = null;
    for (let i = 0; i < count; i++) {
      const seg = m.FPDFPath_GetPathSegment(objPtr, i);
      if (!seg) return [];
      if (!m.FPDFPathSegment_GetPoint(seg, xPtr, yPtr)) return [];
      const local = {
        x: m.pdfium.getValue(xPtr, "float"),
        y: m.pdfium.getValue(yPtr, "float"),
      };
      const pt = applyAffine(matrix, local.x, local.y);
      const type = m.FPDFPathSegment_GetType(seg);
      if (type === SEG_MOVETO) {
        subpathStart = pt;
      } else if (type === SEG_LINETO && prev) {
        pushEdge(out, prev, pt);
        // A closed subpath draws its final edge back to where it started.
        if (m.FPDFPathSegment_GetClose(seg) && subpathStart) {
          pushEdge(out, pt, subpathStart);
        }
      }
      prev = pt;
    }
  } catch {
    return [];
  } finally {
    m.pdfium.wasmExports.free(xPtr);
    m.pdfium.wasmExports.free(yPtr);
  }
  return out;
}

function pushEdge(
  out: PageRect[],
  a: { x: number; y: number },
  b: { x: number; y: number },
): void {
  const rect = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
  if (isRuleShaped(rect)) out.push(rect);
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

interface StrokeReaderModule {
  FPDFPageObj_GetStrokeColor?: (
    obj: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => boolean;
  FPDFPageObj_GetStrokeWidth?: (obj: number, out: number) => boolean;
}

/** Render modes that actually put stroke ink on the page. */
const STROKING_MODES = new Set([1, 2, 5, 6]);

// Outline colour and width, or null when the object does not stroke. PDFium
// reports a stroke colour for every text object, so the render mode decides.
function readStroke(
  m: WrappedPdfiumModule,
  objPtr: number,
  renderMode: number,
): { stroke: RGBA | null; strokeWidth: number } {
  if (!STROKING_MODES.has(renderMode)) return { stroke: null, strokeWidth: 0 };
  const mod = m as unknown as StrokeReaderModule;
  const getColor = mod.FPDFPageObj_GetStrokeColor;
  const getWidth = mod.FPDFPageObj_GetStrokeWidth;
  if (!getColor) return { stroke: null, strokeWidth: 0 };
  const r = m.pdfium.wasmExports.malloc(4);
  const g = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const a = m.pdfium.wasmExports.malloc(4);
  const w = m.pdfium.wasmExports.malloc(4);
  try {
    if (!getColor(objPtr, r, g, b, a)) return { stroke: null, strokeWidth: 0 };
    const alpha = m.pdfium.getValue(a, "i32") & 0xff;
    let strokeWidth = 0;
    if (getWidth && getWidth(objPtr, w)) {
      const raw = m.pdfium.getValue(w, "float");
      if (Number.isFinite(raw) && raw > 0) strokeWidth = raw;
    }
    return {
      stroke: {
        r: m.pdfium.getValue(r, "i32") & 0xff,
        g: m.pdfium.getValue(g, "i32") & 0xff,
        b: m.pdfium.getValue(b, "i32") & 0xff,
        a: alpha,
      },
      strokeWidth,
    };
  } catch {
    return { stroke: null, strokeWidth: 0 };
  } finally {
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(g);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(a);
    m.pdfium.wasmExports.free(w);
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
  // Some PDFs carry the 6-letter subset tag only on /BaseFont, not the embedded
  // name table.
  const baseRaw = readFontNameVia(m, fontPtr, m.FPDFFont_GetBaseFontName);
  // Plenty of embedded fonts expose no name-table family at all. /BaseFont
  // still names the face, and that name is what decides the fallback's
  // serif/sans class - calling it "Unknown" silently substituted Helvetica
  // into serif documents.
  const nameRaw = familyRaw ?? baseRaw;
  if (nameRaw == null) return { family: "Unknown", subset: false };
  const tagged = SUBSET_TAG_RE.test(nameRaw);
  const family = tagged ? nameRaw.slice(7) : nameRaw;
  if (tagged) return { family, subset: true };
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
    // invisible, selectable, editable ghost runs - skip them.
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
    // The on-page visible font size is `rawFontSize * |matrix scale|`.
    const matrixScale =
      Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b) || 1;
    const fontSize = rawFontSize * matrixScale;

    const fontPtr = m.FPDFTextObj_GetFont(objPtr);
    const { family, subset } = readFontFamily(m, fontPtr);
    // Prime this font's glyph cmap here, in the loader's SERIALIZED text-read
    // phase (before the page rasterizes).
    if (fontPtr) primeFontGlyphMap(fontPtr, m);
    // Make the same face available to the overlay as a CSS FontFace.
    if (fontPtr) registerEmbeddedFace(m, fontPtr);
    // Treat the PDFium font handle pointer as a unique id within the doc.
    const fontId = fontPtr ? `pdf:${fontPtr}` : `pdf:unknown-${index}`;

    // Text render mode (PDF Tr): 0 fill (default), 1/2 stroke variants, 3
    // invisible (OCR text layers over scans), 4-7 clipping variants.
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

    const { stroke, strokeWidth } = readStroke(m, objPtr, renderMode);

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
      stroke: stroke ?? undefined,
      strokeWidth,
    });
  }
}

function readImage(
  m: WrappedPdfiumModule,
  page: Page,
  objPtr: number,
  index: number | string,
  transform: Affine,
  containerPtr: number,
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
    containerPtr,
  });
}
