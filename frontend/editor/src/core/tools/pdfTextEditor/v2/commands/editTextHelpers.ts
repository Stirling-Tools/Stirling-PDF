import { writeUtf16 } from "@app/services/pdfiumService";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/** True when every character in `text` is also present in `pool`. */
export function everyCharIn(text: string, pool: string): boolean {
  const set = new Set(pool);
  for (const c of text) if (!set.has(c)) return false;
  return true;
}

/**
 * Strip characters a base-14 (WinAnsi) font cannot render. PDFium's
 * FPDFText_SetText silently maps anything outside Latin-1 to U+00FF
 * (ydieresis) "tofu", so for the base-14 fallback we DROP non-representable
 * code points (CJK, emoji, etc.) rather than persist garbage glyphs.
 *
 * Iterates by code POINT so an astral char (surrogate pair) is dropped whole -
 * a lone surrogate is never left behind. NBSP becomes a normal space (base-14
 * maps U+00A0 to ydieresis too).
 */
export function sanitizeForBase14(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x00a0) {
      out += " ";
    } else if (cp <= 0xff) {
      out += ch;
    }
    // else: unrepresentable in base-14 - drop it (no tofu).
  }
  return out;
}

/**
 * Every PDFium pointer that backs a run. A run can be one of:
 *  - paragraph (multi-line) → `paragraphLeafPtrs` (every leaf across every line)
 *  - merged line group     → `mergedFromPtrs`
 *  - singleton             → `[pdfiumObjPtr]`
 *
 * Prefers the leaf list for paragraphs so removal hits every original
 * sub-word, not just the first ptr of each line.
 */
export function collectMemberPtrs(run: TextRun): number[] {
  if (run.paragraphLeafPtrs.length > 0) return run.paragraphLeafPtrs;
  if (run.paragraphMemberPtrs.length > 0) return run.paragraphMemberPtrs;
  if (run.mergedFromPtrs.length > 0) return run.mergedFromPtrs;
  return [run.pdfiumObjPtr];
}

/**
 * Parallel map from member pointer to its form-xobject container (zero
 * for page-level members). Lets the caller pick FPDFFormObj_RemoveObject
 * vs FPDFPage_RemoveObject per pointer.
 */
export function collectContainersByPtr(run: TextRun): Map<number, number> {
  const map = new Map<number, number>();
  if (run.paragraphLeafPtrs.length > 0) {
    run.paragraphLeafPtrs.forEach((ptr, i) => {
      map.set(ptr, run.paragraphLeafContainers[i] ?? 0);
    });
    return map;
  }
  if (run.paragraphMemberPtrs.length > 0) {
    run.paragraphMemberPtrs.forEach((ptr, i) => {
      map.set(ptr, run.paragraphMemberContainers[i] ?? 0);
    });
    return map;
  }
  for (const ptr of run.mergedFromPtrs) map.set(ptr, run.containerPtr);
  if (run.pdfiumObjPtr) map.set(run.pdfiumObjPtr, run.containerPtr);
  return map;
}

interface FormRemovalModule {
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

/**
 * Best-effort removal of every pointer in `ptrs`. Returns true only if
 * the caller can skip the cover rect (every pointer actually removed).
 */
export function removeMemberPtrs(
  m: WrappedPdfiumModule,
  page: Page,
  ptrs: number[],
  containerByPtr: Map<number, number>,
  fallbackContainerPtr: number,
): boolean {
  if (ptrs.length === 0) return false;
  const formMod = m as unknown as FormRemovalModule;
  let allOk = true;
  for (const ptr of ptrs) {
    if (!ptr) {
      allOk = false;
      continue;
    }
    const container = containerByPtr.get(ptr) ?? fallbackContainerPtr;
    let ok: boolean;
    if (container && formMod.FPDFFormObj_RemoveObject) {
      try {
        ok = !!formMod.FPDFFormObj_RemoveObject(container, ptr);
      } catch {
        ok = false;
      }
    } else {
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) allOk = false;
  }
  return allOk;
}

interface CreatedTextOptions {
  doc: { docPtr: number; module: WrappedPdfiumModule };
  page: Page;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: { r: number; g: number; b: number; a: number };
  /** When non-zero, reuse the source font instead of base-14. */
  originalFontPtr: number;
  /** Base-14 family used when `originalFontPtr` is zero. Defaults to Helvetica. */
  fallbackFamily?: string;
}

interface CreateTextObjModule {
  FPDFPageObj_CreateTextObj?: (
    doc: number,
    font: number,
    size: number,
  ) => number;
}

// NOTE on spaces: PDFium normalises consecutive ASCII spaces inside a
// single text object (FPDFText_SetText / FPDFText_SetCharcodes both
// collapse them), and base-14 Helvetica maps NBSP (U+00A0) to 0xFF
// (ydieresis), which renders as junk. The only reliable way to preserve
// runs of spaces is to emit one text object per WORD with explicit
// x-positioning between them - see `splitIntoWordChunks` / `emitTextLine`.

let measureCanvas: HTMLCanvasElement | null = null;

/** Hidden canvas used to measure CSS-Helvetica advance widths. */
function measureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  return measureCanvas.getContext("2d");
}

/**
 * Measure the natural advance width of `s` in CSS pixels for the given
 * Helvetica variant + point size, then convert to PDF points (1pt =
 * 1px at 1.0 canvas scale - the canvas API uses CSS pixels which
 * correspond 1:1 with points when the font size is given in pt).
 */
function measureAdvancePt(
  text: string,
  fontFamily: string,
  fontSizePt: number,
): number {
  const ctx = measureCtx();
  if (!ctx) return text.length * fontSizePt * 0.5;
  ctx.font = `${fontSizePt}pt ${fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Split a line into one chunk per word with the trailing whitespace
 * stored as an explicit `gapAfterPt`. This is the ONLY reliable way to
 * preserve inter-word spaces in a PDFium-written text object - the
 * library's text-storage layer collapses ASCII spaces inside a single
 * text object (even single inter-word spaces in some font / encoding
 * configurations), so the caller emits one text object per word and
 * advances the cursor by the measured gap width between them.
 *
 * Empty chunks (consecutive whitespace, leading whitespace) are dropped
 * - their visual width is folded into the previous chunk's `gapAfterPt`
 * so positioning still tracks the source text.
 */
export interface WordChunk {
  text: string;
  gapAfterPt: number;
}
export function splitIntoWordChunks(
  line: string,
  fontFamily: string,
  fontSizePt: number,
): WordChunk[] {
  const chunks: WordChunk[] = [];
  // Any run of 1+ whitespace becomes a chunk boundary. Earlier versions
  // only split on 2+ spaces (assuming PDFium preserved single spaces in
  // the text object) - that assumption turned out to be unreliable, so
  // every whitespace run is now an explicit positional jump.
  const gapRe = /[ \t]+/g;
  let leadingGapPt = 0;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = gapRe.exec(line)) !== null) {
    const before = line.slice(lastIdx, m.index);
    const gapText = m[0];
    const gapPt = measureAdvancePt(gapText, fontFamily, fontSizePt);
    if (before.length === 0) {
      // Whitespace at the very start of `line`, or two whitespace runs
      // back-to-back with no non-space char between. Fold the gap into
      // the next chunk's leading offset rather than emitting an empty
      // text object PDFium would reject.
      leadingGapPt += gapPt;
    } else {
      chunks.push({ text: before, gapAfterPt: gapPt });
    }
    lastIdx = gapRe.lastIndex;
  }
  // Trailing non-whitespace tail.
  if (lastIdx < line.length) {
    chunks.push({ text: line.slice(lastIdx), gapAfterPt: 0 });
  }
  // Leading whitespace is exposed as a side field the caller folds into
  // the initial cursor (it can't live in any chunk's gapAfterPt).
  (chunks as WordChunk[] & { leadingGapPt?: number }).leadingGapPt =
    leadingGapPt;
  return chunks;
}

/**
 * Insert one or more text objects representing `opts.text`. Text with
 * no whitespace becomes a single PDFium text object. Text with any
 * whitespace becomes one text object per word, with the inter-word
 * gaps emitted as explicit positional jumps via x-offset.
 *
 * The per-word path is the only reliable way to keep PDFium from
 * collapsing inter-word spaces during its text-object serialisation
 * (single AND consecutive spaces can both be stripped depending on
 * font / encoding combination). One text object per word sidesteps the
 * question entirely - PDFium has no spaces to collapse.
 *
 * The first returned pointer is the "anchor" (the model run's
 * `pdfiumObjPtr`); the rest live alongside it and must be tracked for
 * revert.
 */
export function emitTextLine(opts: CreatedTextOptions): number[] {
  const m = opts.doc.module;
  const size = Math.max(4, opts.fontSize);
  const family = opts.fallbackFamily ?? "Helvetica";
  const m2 = m as unknown as CreateTextObjModule;
  const canReuse = opts.originalFontPtr !== 0 && !!m2.FPDFPageObj_CreateTextObj;

  // Emit ONE word at (x, y) and return its pointer (0 on failure).
  //
  // When reusing the source font, VALIDATE that it actually rendered visible
  // glyphs: subset / CID fonts without a usable Unicode->glyph map return
  // ~0-width `.notdef` glyphs from `FPDFText_SetText`, which is how a font
  // re-emit "rewrites a whole paragraph with broken glyphs". If the rendered
  // width is sub-threshold we drop the object and re-emit the word in base-14
  // Helvetica, so a rewrite NEVER persists invisible / garbled text - it
  // keeps the source font only where that font genuinely renders the chars.
  const emitWord = (text: string, x: number): number => {
    // base-14 can only render Latin-1; drop the rest so PDFium never emits
    // U+00FF tofu. The reused source font keeps the raw text (it may have the
    // glyphs); only the fallback path sanitises.
    const base14Text = sanitizeForBase14(text);
    const newBase14 = (): number =>
      m.FPDFPageObj_NewTextObj(opts.doc.docPtr, family, size);
    const emitBase14 = (): number => {
      if (base14Text.length === 0) return 0; // nothing representable - drop
      const p = newBase14();
      if (!p) return 0;
      setTextOn(m, p, base14Text);
      applyFillAndPos(m, opts.page, p, opts.fill, x, opts.y);
      return p;
    };
    if (!canReuse) return emitBase14();

    const ptr = m2.FPDFPageObj_CreateTextObj!(
      opts.doc.docPtr,
      opts.originalFontPtr,
      size,
    );
    if (!ptr) return emitBase14();
    setTextOn(m, ptr, text);
    applyFillAndPos(m, opts.page, ptr, opts.fill, x, opts.y);
    const right = measureObjRightEdgePt(m, ptr);
    const visible = text.replace(/\s+/g, "").length;
    // Narrowest base-14 glyph ("i") is ~0.22em; anything well under ~0.15em
    // per visible char means the reused font produced .notdef / 0-width.
    const minExpected = visible * size * 0.15;
    if (visible > 0 && right - x < minExpected) {
      try {
        m.FPDFPage_RemoveObject(opts.page.pagePtr, ptr);
      } catch {
        /* best-effort - the failed object is discarded */
      }
      return emitBase14();
    }
    return ptr;
  };

  // Fast path: no whitespace at all → one text object holds the whole word.
  const hasAnyWhitespace = /\s/.test(opts.text);
  if (!hasAnyWhitespace) {
    const ptr = emitWord(opts.text, opts.x);
    return ptr ? [ptr] : [];
  }

  // Per-chunk emit (split on ANY whitespace run). After each emit we
  // read the actual right edge from PDFium so the next chunk's x is
  // exact - canvas measureText uses the browser's Helvetica fallback
  // (often Liberation Sans) which overestimates Helvetica's advance by
  // 15-20% and would leave huge gaps between chunks otherwise.
  const chunks = splitIntoWordChunks(opts.text, family, size) as WordChunk[] & {
    leadingGapPt?: number;
  };
  const ptrs: number[] = [];
  let cursor = opts.x + (chunks.leadingGapPt ?? 0);
  for (const chunk of chunks) {
    if (chunk.text.length > 0) {
      const ptr = emitWord(chunk.text, cursor);
      if (!ptr) continue;
      const measured = measureObjRightEdgePt(m, ptr);
      cursor =
        measured > cursor
          ? measured
          : cursor + measureAdvancePt(chunk.text, family, size);
      ptrs.push(ptr);
    }
    cursor += chunk.gapAfterPt;
  }
  return ptrs;
}

export function measureObjRightEdgePt(
  m: WrappedPdfiumModule,
  objPtr: number,
): number {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(objPtr, l, b, r, t)) return 0;
    return m.pdfium.getValue(r, "float");
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}

function setTextOn(m: WrappedPdfiumModule, ptr: number, text: string): void {
  const textPtr = writeUtf16(m, text);
  try {
    m.FPDFText_SetText(ptr, textPtr);
  } finally {
    m.pdfium.wasmExports.free(textPtr);
  }
}

function applyFillAndPos(
  m: WrappedPdfiumModule,
  page: Page,
  ptr: number,
  fill: { r: number; g: number; b: number; a: number },
  x: number,
  y: number,
): void {
  m.FPDFPageObj_SetFillColor(ptr, fill.r, fill.g, fill.b, fill.a);
  m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, x, y);
  m.FPDFPage_InsertObject(page.pagePtr, ptr);
}

/** Insert a filled rectangle (cover/background) and return its pointer. */
export function emitFillRect(
  m: WrappedPdfiumModule,
  page: Page,
  bounds: { x: number; y: number; width: number; height: number },
  fill: { r: number; g: number; b: number },
  margin = 1.5,
): number {
  const ptr = m.FPDFPageObj_CreateNewRect(
    bounds.x - margin,
    bounds.y - margin,
    bounds.width + margin * 2,
    bounds.height + margin * 2,
  );
  if (!ptr) return 0;
  m.FPDFPageObj_SetFillColor(ptr, fill.r, fill.g, fill.b, 255);
  m.FPDFPath_SetDrawMode(ptr, 2, false);
  m.FPDFPage_InsertObject(page.pagePtr, ptr);
  return ptr;
}
