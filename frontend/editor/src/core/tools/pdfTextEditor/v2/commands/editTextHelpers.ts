import { readUtf16, writeUtf16 } from "@app/services/pdfiumService";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { RGBA } from "@app/tools/pdfTextEditor/v2/types";
import {
  emitCharcodeEvent,
  findFontForChar,
  setCharcodesOn,
  tryResolveCharcodes,
} from "@app/tools/pdfTextEditor/v2/charcode/charcodeRegistry";
import { getActiveCharcodeStrategy } from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";
import { emitFallbackTextObject } from "@app/tools/pdfTextEditor/v2/util/fallbackFont";
import { emitDeviceFontTextObject } from "@app/tools/pdfTextEditor/v2/util/deviceFontEmbed";
import { nearestStandardFont } from "@app/tools/pdfTextEditor/v2/util/fontFamily";

// Remove a PAGE-level object and FREE its PDFium allocation.
// `FPDFPage_RemoveObject` only detaches the object.
export function removeAndDestroyObject(
  m: WrappedPdfiumModule,
  pagePtr: number,
  ptr: number,
): void {
  if (!ptr) return;
  try {
    m.FPDFPage_RemoveObject(pagePtr, ptr);
  } catch {
    /* best-effort */
  }
  try {
    m.FPDFPageObj_Destroy(ptr);
  } catch {
    /* best-effort */
  }
}

// Pointers freshly created by the per-char BACKEND emit branch in
// `emitTextLine`.
const perCharBranchPtrs = new Set<number>();

// (fontPtr:char) pairs a read-back has PROVEN render faithfully via SetText.
const readBackValidated = new Set<string>();

/** Caller check: was this ptr produced by the per-char emit branch? */
export function isVerifiedPerCharPtr(ptr: number): boolean {
  return perCharBranchPtrs.has(ptr);
}

/** Doc-scoped reset: PDFium reuses freed pointers across documents. */
export function resetPerCharBranchPtrs(): void {
  perCharBranchPtrs.clear();
  readBackValidated.clear();
}

/** Test-only: clear the verified-ptr set between cases. */
export function _clearVerifiedPerCharPtrsForTests(): void {
  resetPerCharBranchPtrs();
}

// Characters that an edit could NOT represent and silently dropped: the source
// font couldn't render them.
const droppedBase14Chars = new Set<string>();

/** Visible chars dropped this session because nothing could render them. */
export function getDroppedBase14Chars(): string[] {
  return [...droppedBase14Chars];
}

/** Doc-scoped reset for the dropped-char record. */
export function resetDroppedBase14Chars(): void {
  droppedBase14Chars.clear();
}

/** Test-only alias for {@link resetDroppedBase14Chars}. */
export function _clearDroppedBase14CharsForTests(): void {
  resetDroppedBase14Chars();
}

/** Record every VISIBLE char present in `original` but missing from `kept`. */
function recordDroppedChars(original: string, kept: string): void {
  const keptSet = new Set(kept);
  for (const ch of original) {
    if (!keptSet.has(ch) && ch.trim().length > 0) droppedBase14Chars.add(ch);
  }
}

/** True when every character in `text` is also present in `pool`. */
export function everyCharIn(text: string, pool: string): boolean {
  const set = new Set(pool);
  for (const c of text) if (!set.has(c)) return false;
  return true;
}

// True when the emit path will map EVERY char in this font. Same condition
// emitTextLine uses to take its setCharcodes branch, so a true here means the
// reuse really will render rather than fall through to raw SetText.
export function charcodesResolveFully(
  m: WrappedPdfiumModule,
  fontPtr: number,
  text: string,
  pagePtr: number,
  docPtr: number,
): boolean {
  if (!fontPtr || !text) return false;
  try {
    const resolved = tryResolveCharcodes(
      fontPtr,
      text,
      { module: m, pagePtr, docPtr },
      true,
    );
    const r = resolved?.result;
    return (
      !!r && r.coverage === text.length && r.charcodes.length === text.length
    );
  } catch {
    return false;
  }
}

/** Strip characters a base-14 (WinAnsi) font cannot render. */
export function sanitizeForBase14(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      out += ch;
    } else if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) {
      // C0/DEL/C1 controls are un-encodable in WinAnsi - drop them.
      continue;
    } else if (cp === 0x00a0) {
      out += " ";
    } else if (cp <= 0xff) {
      out += ch;
    }
    // else: unrepresentable in base-14 - drop it (no tofu).
  }
  return out;
}

/** Every PDFium pointer that backs a run. */
export function collectMemberPtrs(run: TextRun): number[] {
  if (run.paragraphLeafPtrs.length > 0) return run.paragraphLeafPtrs;
  if (run.paragraphMemberPtrs.length > 0) return run.paragraphMemberPtrs;
  if (run.mergedFromPtrs.length > 0) return run.mergedFromPtrs;
  return [run.pdfiumObjPtr];
}

// Parallel map from member pointer to its form-xobject container (zero for
// page-level members).
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

/** Best-effort removal of every pointer in `ptrs`. */
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
  doc: EditorDocument;
  page: Page;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: { r: number; g: number; b: number; a: number };
  /** When non-zero, reuse the source font instead of base-14. */
  originalFontPtr: number;
  /** Whether the reused source font is a SUBSET font. */
  originalFontSubset?: boolean;
  /** Base-14 family used when `originalFontPtr` is zero. Defaults to Helvetica. */
  fallbackFamily?: string;
  /** The source run's PDF text render mode (Tr). */
  renderMode?: number;
  /** Glyph outline colour; only paints under a stroking render mode. */
  stroke?: RGBA | null;
  strokeWidth?: number;
  /** The run's on-page rotation (normalised cos/sin of its text matrix). */
  rotation?: { cos: number; sin: number };
  // Extra advance per glyph in PDF points - the source run's rendered
  // letter-spacing (Tc), inferred at read time.
  charSpacingPt?: number;
}

interface CreateTextObjModule {
  FPDFPageObj_CreateTextObj?: (
    doc: number,
    font: number,
    size: number,
  ) => number;
}

// NOTE on spaces: PDFium normalises consecutive ASCII spaces inside a single
// text object, and base-14 Helvetica maps NBSP to 0xFF, which renders as junk.

let measureCanvas: HTMLCanvasElement | null = null;

/** Hidden canvas used to measure CSS-Helvetica advance widths. */
function measureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  return measureCanvas.getContext("2d");
}

// Map a base-14 PostScript name to a CSS font spec the browser actually has.
export function cssFontSpecFor(fontFamily: string, sizePx: number): string {
  const f = fontFamily.toLowerCase();
  const bold = f.includes("bold") ? "bold " : "";
  const italic = f.includes("italic") || f.includes("oblique") ? "italic " : "";
  let stack = "Helvetica, Arial, sans-serif";
  if (f.startsWith("times")) stack = "'Times New Roman', Times, serif";
  else if (f.startsWith("courier")) stack = "'Courier New', Courier, monospace";
  return `${italic}${bold}${sizePx}px ${stack}`;
}

/** Measure the natural advance width of `s` in PDF points. */
function measureAdvancePt(
  text: string,
  fontFamily: string,
  fontSizePt: number,
): number {
  const ctx = measureCtx();
  if (!ctx) return text.length * fontSizePt * 0.5;
  ctx.font = cssFontSpecFor(fontFamily, fontSizePt);
  return ctx.measureText(text).width;
}

// Per-page cache of each char's ON-PAGE rendered advance (per em), keyed
// pagePtr -> fontPtr -> unicode -> advanceEm.
const onPageAdvCache = new Map<number, Map<number, Map<number, number>>>();

interface LooseBoxModule {
  FPDFText_LoadPage?: (page: number) => number;
  FPDFText_ClosePage?: (tp: number) => void;
  FPDFText_CountChars?: (tp: number) => number;
  FPDFText_GetUnicode?: (tp: number, i: number) => number;
  FPDFText_GetTextObject?: (tp: number, i: number) => number;
  FPDFTextObj_GetFont?: (obj: number) => number;
  FPDFText_GetFontSize?: (tp: number, i: number) => number;
  FPDFText_GetLooseCharBox?: (tp: number, i: number, rect: number) => boolean;
}

function looseBoxAdvancePt(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  tp: number,
  idx: number,
): number | null {
  const mod = m as unknown as LooseBoxModule;
  if (!mod.FPDFText_GetLooseCharBox) return null;
  const wasm = (
    m.pdfium as unknown as {
      wasmExports: { malloc: (n: number) => number; free: (p: number) => void };
    }
  ).wasmExports;
  const buf = wasm.malloc(16); // FS_RECT = 4 floats {left, top, right, bottom}
  try {
    if (!mod.FPDFText_GetLooseCharBox(tp, idx, buf)) return null;
    const heap = (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
    const f32 = new Float32Array(heap.buffer, buf, 4);
    const width = f32[2] - f32[0];
    return width > 0 ? width : null;
  } catch {
    return null;
  } finally {
    wasm.free(buf);
  }
}

/** |scale| of a page object's matrix (1 when unreadable). */
function objMatrixScale(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  objPtr: number,
): number {
  const buf = m.pdfium.wasmExports.malloc(6 * 4);
  try {
    if (!m.FPDFPageObj_GetMatrix(objPtr, buf)) return 1;
    const a = m.pdfium.getValue(buf, "float");
    const b = m.pdfium.getValue(buf + 4, "float");
    const s = Math.hypot(a, b);
    return s > 0 ? s : 1;
  } catch {
    return 1;
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function buildOnPageAdvMap(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  pagePtr: number,
): Map<number, Map<number, number>> {
  const mod = m as unknown as LooseBoxModule;
  const out = new Map<number, Map<number, number>>();
  if (
    !mod.FPDFText_LoadPage ||
    !mod.FPDFText_CountChars ||
    !mod.FPDFText_GetUnicode ||
    !mod.FPDFText_GetTextObject ||
    !mod.FPDFTextObj_GetFont ||
    !mod.FPDFText_GetFontSize
  ) {
    return out;
  }
  const tp = mod.FPDFText_LoadPage(pagePtr);
  if (!tp) return out;
  // FPDFText_GetFontSize returns the raw Tf operand, but many producers set Tf
  // 1 and carry the real size in the text matrix.
  const scaleByObj = new Map<number, number>();
  try {
    const count = mod.FPDFText_CountChars(tp);
    for (let i = 0; i < count; i++) {
      const u = mod.FPDFText_GetUnicode(tp, i);
      if (!u) continue;
      const obj = mod.FPDFText_GetTextObject(tp, i);
      if (!obj) continue;
      let font = 0;
      try {
        font = mod.FPDFTextObj_GetFont(obj);
      } catch {
        /* skip */
      }
      if (!font) continue;
      let fm = out.get(font);
      if (!fm) {
        fm = new Map<number, number>();
        out.set(font, fm);
      }
      if (fm.has(u)) continue;
      const fs = mod.FPDFText_GetFontSize(tp, i);
      if (!fs || fs <= 0) continue;
      let scale = scaleByObj.get(obj);
      if (scale === undefined) {
        scale = objMatrixScale(m, obj);
        scaleByObj.set(obj, scale);
      }
      const effFs = fs * scale;
      if (!effFs || effFs <= 0) continue;
      const adv = looseBoxAdvancePt(m, tp, i);
      if (adv == null) continue;
      fm.set(u, adv / effFs);
    }
  } finally {
    try {
      mod.FPDFText_ClosePage?.(tp);
    } catch {
      /* best-effort */
    }
  }
  return out;
}

/** On-page rendered advance (per em) of `ch` in `font`, or null if absent. */
function onPageAdvanceEm(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  pagePtr: number,
  font: number,
  ch: string,
): number | null {
  if (!font) return null;
  let pageMap = onPageAdvCache.get(pagePtr);
  if (!pageMap) {
    pageMap = buildOnPageAdvMap(m, pagePtr);
    onPageAdvCache.set(pagePtr, pageMap);
  }
  const cp = ch.codePointAt(0) ?? 0;
  return pageMap.get(font)?.get(cp) ?? null;
}

/** Drop the per-page on-page-advance cache. */
export function resetOnPageAdvCache(): void {
  onPageAdvCache.clear();
}

/** Test-only alias for {@link resetOnPageAdvCache}. */
export function _clearOnPageAdvCacheForTests(): void {
  resetOnPageAdvCache();
}

// Split a line into one chunk per word with the trailing whitespace stored as
// an explicit `gapAfterPt`.
export interface WordChunk {
  text: string;
  gapAfterPt: number;
  /** How many whitespace chars the gap after this chunk represents. */
  gapCharCount: number;
}
export function splitIntoWordChunks(
  line: string,
  fontFamily: string,
  fontSizePt: number,
): WordChunk[] {
  const chunks: WordChunk[] = [];
  // Any run of 1+ whitespace becomes a chunk boundary.
  const gapRe = /\s+/g;
  let leadingGapPt = 0;
  let leadingGapChars = 0;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = gapRe.exec(line)) !== null) {
    const before = line.slice(lastIdx, m.index);
    const gapText = m[0];
    const gapPt = measureAdvancePt(gapText, fontFamily, fontSizePt);
    if (before.length === 0) {
      // Whitespace at the very start of `line`, or two whitespace runs
      // back-to-back with no non-space char between.
      leadingGapPt += gapPt;
      leadingGapChars += gapText.length;
    } else {
      chunks.push({
        text: before,
        gapAfterPt: gapPt,
        gapCharCount: gapText.length,
      });
    }
    lastIdx = gapRe.lastIndex;
  }
  // Trailing non-whitespace tail.
  if (lastIdx < line.length) {
    chunks.push({ text: line.slice(lastIdx), gapAfterPt: 0, gapCharCount: 0 });
  }
  // Leading whitespace is exposed as a side field the caller folds into
  // the initial cursor (it can't live in any chunk's gapAfterPt).
  const side = chunks as WordChunk[] & {
    leadingGapPt?: number;
    leadingGapChars?: number;
  };
  side.leadingGapPt = leadingGapPt;
  side.leadingGapChars = leadingGapChars;
  return chunks;
}

/** Insert one or more text objects representing `opts.text`. */
/** Normalised rotation of a text matrix, or undefined for upright text. */
export function rotationFromMatrix(matrix: {
  a: number;
  b: number;
  c?: number;
  d?: number;
}): { cos: number; sin: number } | undefined {
  const scale = Math.hypot(matrix.a, matrix.b);
  if (!scale) return undefined;
  const cos = matrix.a / scale;
  const sin = matrix.b / scale;
  // A mirrored generator reads as sin~=0 / cos>0 from a,b ALONE and used to be
  // mistaken for plain upright text.
  const c = matrix.c ?? 0;
  const d = matrix.d ?? scale;
  const mirrored = matrix.a * d - matrix.b * c < 0;
  if (Math.abs(sin) < 1e-4 && cos > 0 && !mirrored) return undefined;
  return { cos, sin };
}

// The rotation a NEW object needs so it reads upright on a page displayed with
// `/Rotate` (quarter-turns CW).
export function counterPageRotation(
  rotateQuarterTurnsCw: number,
): { cos: number; sin: number } | undefined {
  switch (((rotateQuarterTurnsCw % 4) + 4) % 4) {
    case 1:
      return { cos: 0, sin: 1 };
    case 2:
      return { cos: -1, sin: 0 };
    case 3:
      return { cos: 0, sin: -1 };
    default:
      return undefined;
  }
}

/** Rotate a page object about (ax, ay). Identity (no-op) when cos=1, sin=0. */
export function rotateObjectAbout(
  m: WrappedPdfiumModule,
  ptr: number,
  ax: number,
  ay: number,
  cos: number,
  sin: number,
): void {
  m.FPDFPageObj_Transform(
    ptr,
    cos,
    sin,
    -sin,
    cos,
    ax - ax * cos + ay * sin,
    ay - ax * sin - ay * cos,
  );
}

export function emitTextLine(opts: CreatedTextOptions): number[] {
  const m = opts.doc.module;
  const size = Math.max(4, opts.fontSize);
  const family = opts.fallbackFamily ?? "Helvetica";
  const m2 = m as unknown as CreateTextObjModule;
  const canReuse = opts.originalFontPtr !== 0 && !!m2.FPDFPageObj_CreateTextObj;

  // Words are laid out horizontally from (opts.x, opts.y).
  const withRotation = (ptrs: number[]): number[] => {
    const rot = opts.rotation;
    if (rot) {
      for (const p of ptrs) {
        if (p) rotateObjectAbout(m, p, opts.x, opts.y, rot.cos, rot.sin);
      }
    }
    // Every successful emit funnels through here, so this is the one place to
    // re-apply the source run's ink state - new objects default to a flat fill.
    applyInkState(m, ptrs, opts);
    return ptrs;
  };

  // Emit ONE word at (x, y) and return its pointer (0 on failure).
  const emitWord = (text: string, x: number): number => {
    // base-14 can only render Latin-1; drop the rest so PDFium never emits
    // U+00FF tofu.
    const base14Text = sanitizeForBase14(text);
    const newBase14 = (): number => {
      const ptr = m.FPDFPageObj_NewTextObj(opts.doc.docPtr, family, size);
      if (ptr) return ptr;
      // PDFium only knows the standard font names, so any other family fails
      // here. Substituting is what editors do; returning 0 would drop the text.
      const substitute = nearestStandardFont(family);
      return substitute === family
        ? 0
        : m.FPDFPageObj_NewTextObj(opts.doc.docPtr, substitute, size);
    };
    const emitBase14 = (): number => {
      // A pre-warmed device font emits with its REAL face. Standard names skip
      // this and a cold cache returns 0, so existing emits are unchanged.
      if (nearestStandardFont(family) !== family) {
        const dp = emitDeviceFontTextObject(
          opts.doc,
          opts.page,
          family,
          text,
          size,
          opts.fill,
          x,
          opts.y,
        );
        if (dp) return dp;
      }
      // Some chars are outside base-14's Latin-1 range.
      if ([...text].length > [...base14Text].length) {
        const fp = emitFallbackTextObject(
          opts.doc,
          opts.page,
          text,
          size,
          opts.fill,
          x,
          opts.y,
        );
        if (fp) return fp;
        // The bundled Noto fallback couldn't render the non-Latin chars either,
        // so the base-14 emit below drops them.
        recordDroppedChars(text, base14Text);
      }
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
    // Reuse path: resolve real font charcodes so the embedded subset font
    // renders the chars; falls back to SetText internally.
    const strategyUsed = writeViaCharcodesOrSetText(ptr, text);
    applyFillAndPos(m, opts.page, ptr, opts.fill, x, opts.y);
    // A whole-word SetCharcodes write via the BACKEND resolver used known-good
    // (font, charcode) pairs PDFBox validated, so the glyph is real.
    if (strategyUsed === "backend") return ptr;
    const right = measureObjRightEdgePt(m, ptr);
    const visible = text.replace(/\s+/g, "").length;
    // Narrowest base-14 glyph ("i") is ~0.22em; anything well under ~0.15em
    // per visible char means the reused font produced .notdef / 0-width.
    const minExpected = visible * size * 0.15;
    if (visible > 0 && right - x < minExpected) {
      // Discard the .notdef object and free it (we re-emit in base-14 next).
      removeAndDestroyObject(m, opts.page.pagePtr, ptr);
      return emitBase14();
    }
    // Read-back validation for a source-font SetText.
    if (strategyUsed === null) {
      // Throttle: chars a previous read-back already proved this font renders
      // faithfully never need re-checking.
      const visibleChars = [...text].filter((c) => c.trim().length > 0);
      const allProven =
        opts.originalFontPtr !== 0 &&
        visibleChars.every((c) =>
          readBackValidated.has(`${opts.originalFontPtr}:${c}`),
        );
      if (!allProven) {
        const got = readBackTextObj(m, opts.page.pagePtr, ptr);
        if (got !== null) {
          const norm = (s: string) => s.replace(/\s+/g, "");
          if (norm(got) !== norm(text)) {
            removeAndDestroyObject(m, opts.page.pagePtr, ptr);
            return emitBase14();
          }
          if (opts.originalFontPtr) {
            for (const c of visibleChars) {
              readBackValidated.add(`${opts.originalFontPtr}:${c}`);
            }
          }
        }
      }
    }
    // Self-validate an UNTRUSTED charcode GUESS.
    if (
      (strategyUsed === "content-stream" || strategyUsed === "cmap") &&
      opts.originalFontPtr
    ) {
      let expected = 0;
      let known = 0;
      for (const ch of text) {
        if (/\s/.test(ch)) continue;
        const em = onPageAdvanceEm(
          m,
          opts.page.pagePtr,
          opts.originalFontPtr,
          ch,
        );
        if (em != null) {
          expected += em * size;
          known += 1;
        }
      }
      if (known > 0 && expected > 0) {
        const ratio = (right - x) / expected;
        if (ratio < 0.6 || ratio > 1.7) {
          // Wrong-glyph guess: discard + free, then re-emit in base-14.
          removeAndDestroyObject(m, opts.page.pagePtr, ptr);
          return emitBase14();
        }
      }
    }
    return ptr;
  };

  // Try-charcodes wrapper: when we're reusing a source font AND the active
  // charcode strategy can resolve EVERY char in the chunk.
  function writeViaCharcodesOrSetText(
    ptr: number,
    text: string,
  ): string | null {
    const strategy = getActiveCharcodeStrategy();
    // The content-stream resolver is an untrusted sequential-CID GUESS.
    if (
      strategy === "content-stream" &&
      !(!!opts.originalFontSubset && [...text].length === 1)
    ) {
      emitCharcodeEvent({
        timestamp: 0,
        strategy,
        text,
        fontPtr: opts.originalFontPtr,
        resolved: [],
        missing: [...text],
        note: "content-stream active but ungated (not subset+single-cp) - using SetText",
        outcome: "partial-coverage-fallback",
      });
      setTextOn(m, ptr, text);
      return null;
    }
    if (!canReuse || !opts.originalFontPtr) {
      emitCharcodeEvent({
        timestamp: 0,
        strategy,
        text,
        fontPtr: opts.originalFontPtr,
        resolved: [],
        missing: [...text],
        note: !canReuse
          ? "no source font available (Helvetica fresh emit)"
          : "originalFontPtr is 0",
        outcome: "no-font",
      });
      setTextOn(m, ptr, text);
      return null;
    }
    // allowContentStreamFallback: if the active resolver misses, reuse the
    // on-page glyph via the client-side content-stream resolver.
    const allowGuessFallback =
      !!opts.originalFontSubset && [...text].length === 1;
    const resolved = tryResolveCharcodes(
      opts.originalFontPtr,
      text,
      {
        module: m,
        pagePtr: opts.page.pagePtr,
        docPtr: opts.doc.docPtr,
      },
      allowGuessFallback,
    );
    if (!resolved) {
      emitCharcodeEvent({
        timestamp: 0,
        strategy,
        text,
        fontPtr: opts.originalFontPtr,
        resolved: [],
        missing: [...text],
        note: "active strategy is 'helvetica' (no resolver)",
        outcome: "no-strategy",
      });
      setTextOn(m, ptr, text);
      return null;
    }
    const r = resolved.result;
    if (r && r.coverage === text.length && r.charcodes.length === text.length) {
      const ok = setCharcodesOn(m, ptr, r.charcodes);
      emitCharcodeEvent({
        timestamp: 0,
        strategy: resolved.strategy,
        text,
        fontPtr: opts.originalFontPtr,
        resolved: [...r.charcodes],
        missing: [],
        note: r.note,
        outcome: ok ? "charcodes-ok" : "charcodes-call-failed",
      });
      if (ok) return resolved.strategy;
      // SetCharcodes binding rejected the call - fall back.
    } else if (r) {
      emitCharcodeEvent({
        timestamp: 0,
        strategy: resolved.strategy,
        text,
        fontPtr: opts.originalFontPtr,
        resolved: [...r.charcodes],
        missing: [...r.missing],
        note: r.note,
        outcome: "partial-coverage-fallback",
      });
    } else {
      emitCharcodeEvent({
        timestamp: 0,
        strategy: resolved.strategy,
        text,
        fontPtr: opts.originalFontPtr,
        resolved: [],
        missing: [...text],
        note: "resolver returned null (unavailable for this font)",
        outcome: "partial-coverage-fallback",
      });
    }
    setTextOn(m, ptr, text);
    return null;
  }

  // Per-char emit branch for the BACKEND strategy.
  const isBackendStrategy = getActiveCharcodeStrategy() === "backend";
  const hasAnyWhitespaceForBranch = /\s/.test(opts.text);
  if (
    isBackendStrategy &&
    !hasAnyWhitespaceForBranch &&
    opts.text.length > 0 &&
    m2.FPDFPageObj_CreateTextObj
  ) {
    const ctx = {
      module: m,
      pagePtr: opts.page.pagePtr,
      docPtr: opts.doc.docPtr,
    };
    // Probe per char first.
    const perChar: Array<{ ch: string; font: number; charcodes: number[] }> =
      [];
    let allOk = true;
    for (const ch of opts.text) {
      // Prefer the run's OWN font when it renders this char: it is the
      // authoritative font for the run's text.
      let charFont = 0;
      let resolved = null;
      if (opts.originalFontPtr) {
        const own = tryResolveCharcodes(opts.originalFontPtr, ch, ctx);
        if (
          own?.result &&
          own.result.charcodes.length === 1 &&
          own.result.missing.length === 0
        ) {
          charFont = opts.originalFontPtr;
          resolved = own;
        }
      }
      if (!charFont) {
        charFont = findFontForChar(ch, ctx) || 0;
        if (!charFont) {
          allOk = false;
          break;
        }
        resolved = tryResolveCharcodes(charFont, ch, ctx);
      }
      if (
        !resolved?.result ||
        resolved.result.charcodes.length !== 1 ||
        resolved.result.missing.length > 0
      ) {
        allOk = false;
        break;
      }
      perChar.push({
        ch,
        font: charFont,
        charcodes: resolved.result.charcodes,
      });
    }
    if (allOk && perChar.length === opts.text.length) {
      // Per-char emit: one text object per char, each with its OWN font.
      const ptrs: number[] = [];
      let cursor = opts.x;
      for (const pc of perChar) {
        const ptr = m2.FPDFPageObj_CreateTextObj!(
          opts.doc.docPtr,
          pc.font,
          size,
        );
        if (!ptr) {
          // CreateTextObj failed mid-word.
          for (const p of ptrs) {
            perCharBranchPtrs.delete(p);
            removeAndDestroyObject(m, opts.page.pagePtr, p);
          }
          ptrs.length = 0;
          break;
        }
        const ok = setCharcodesOn(m, ptr, pc.charcodes);
        if (!ok) {
          // Couldn't set charcodes - rare but possible.
          removeAndDestroyObject(m, opts.page.pagePtr, ptr);
          for (const p of ptrs) {
            perCharBranchPtrs.delete(p);
            removeAndDestroyObject(m, opts.page.pagePtr, p);
          }
          ptrs.length = 0;
          break;
        }
        applyFillAndPos(m, opts.page, ptr, opts.fill, cursor, opts.y);
        // Advance by the char's REAL on-page advance width, read from the same
        // font+char already on the page.
        const advEm = onPageAdvanceEm(m, opts.page.pagePtr, pc.font, pc.ch);
        if (advEm != null) {
          cursor += advEm * size;
        } else {
          const measured = measureObjRightEdgePt(m, ptr);
          cursor =
            measured > cursor
              ? measured
              : cursor + measureAdvancePt(pc.ch, family, size);
        }
        // Reproduce the source run's letter-spacing: the glyph advance above is
        // the font's natural width.
        cursor += opts.charSpacingPt ?? 0;
        emitCharcodeEvent({
          timestamp: 0,
          strategy: "backend",
          text: pc.ch,
          fontPtr: pc.font,
          resolved: [...pc.charcodes],
          missing: [],
          note: `per-char backend emit: font=${pc.font} charcode=${pc.charcodes[0]}`,
          outcome: "charcodes-ok",
        });
        ptrs.push(ptr);
        // Mark this ptr as verified - it was created via the per-char branch
        // with a known-good pair from the backend resolver cache.
        perCharBranchPtrs.add(ptr);
      }
      if (ptrs.length === opts.text.length) return withRotation(ptrs);
      // Any other incomplete outcome: destroy the partial emit before the
      // fall-through path re-renders the word.
      for (const p of ptrs) {
        perCharBranchPtrs.delete(p);
        removeAndDestroyObject(m, opts.page.pagePtr, p);
      }
    }
    // fall through to the normal path if per-char attempt didn't work
  }

  // Letter-spaced runs: a single text object cannot carry Tc.
  const hasAnyWhitespace = /\s/.test(opts.text);
  const spacingPt = opts.charSpacingPt ?? 0;
  if (
    !hasAnyWhitespace &&
    Math.abs(spacingPt) > 0.05 &&
    [...opts.text].length > 1
  ) {
    const ptrs: number[] = [];
    let cursor = opts.x;
    for (const ch of opts.text) {
      const ptr = emitWord(ch, cursor);
      if (ptr) ptrs.push(ptr);
      // Advance by the char's true advance width: the on-page advance of the
      // same char+font when it is still measurable, else canvas font metrics.
      const advEm = opts.originalFontPtr
        ? onPageAdvanceEm(m, opts.page.pagePtr, opts.originalFontPtr, ch)
        : null;
      cursor +=
        (advEm != null ? advEm * size : measureAdvancePt(ch, family, size)) +
        spacingPt;
    }
    return withRotation(ptrs);
  }

  // Fast path: no whitespace at all → one text object holds the whole word.
  if (!hasAnyWhitespace) {
    const ptr = emitWord(opts.text, opts.x);
    return withRotation(ptr ? [ptr] : []);
  }

  // Per-chunk emit (split on ANY whitespace run).
  const chunks = splitIntoWordChunks(opts.text, family, size) as WordChunk[] & {
    leadingGapPt?: number;
    leadingGapChars?: number;
  };
  const spacing = opts.charSpacingPt ?? 0;
  const ptrs: number[] = [];
  let cursor =
    opts.x +
    (chunks.leadingGapPt ?? 0) +
    spacing * (chunks.leadingGapChars ?? 0);
  for (const chunk of chunks) {
    if (chunk.text.length > 0) {
      // Recurse per word.
      const wordPtrs = emitTextLine({
        ...opts,
        text: chunk.text,
        x: cursor,
        rotation: undefined,
      });
      if (wordPtrs.length === 0) continue;
      let rightEdge = 0;
      for (const p of wordPtrs)
        rightEdge = Math.max(rightEdge, measureObjRightEdgePt(m, p));
      cursor =
        rightEdge > cursor
          ? rightEdge
          : cursor + measureAdvancePt(chunk.text, family, size);
      ptrs.push(...wordPtrs);
    }
    // Word gaps stretch with the run's letter-spacing too: the source layout
    // applies Tc after the glyph preceding the gap AND after each space.
    cursor +=
      chunk.gapAfterPt +
      (chunk.gapCharCount > 0 ? spacing * (chunk.gapCharCount + 1) : 0);
  }
  return withRotation(ptrs);
}

interface TextObjReadModule {
  FPDFText_LoadPage?: (page: number) => number;
  FPDFText_ClosePage?: (tp: number) => void;
  FPDFTextObj_GetText?: (
    obj: number,
    tp: number,
    buf: number,
    len: number,
  ) => number;
}

// Decode a just-inserted text object's content through the font's ToUnicode
// (what any PDF reader will see), or null when unavailable.
function readBackTextObj(
  m: WrappedPdfiumModule,
  pagePtr: number,
  objPtr: number,
): string | null {
  const mod = m as unknown as TextObjReadModule;
  if (
    !mod.FPDFText_LoadPage ||
    !mod.FPDFTextObj_GetText ||
    !mod.FPDFText_ClosePage
  ) {
    return null;
  }
  const tp = mod.FPDFText_LoadPage(pagePtr);
  if (!tp) return null;
  try {
    const len = mod.FPDFTextObj_GetText(objPtr, tp, 0, 0);
    if (len <= 2) return "";
    const buf = m.pdfium.wasmExports.malloc(len);
    try {
      mod.FPDFTextObj_GetText(objPtr, tp, buf, len);
      return readUtf16(m, buf, len);
    } finally {
      m.pdfium.wasmExports.free(buf);
    }
  } catch {
    return null;
  } finally {
    try {
      mod.FPDFText_ClosePage(tp);
    } catch {
      /* best-effort */
    }
  }
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

interface InkState {
  renderMode?: number;
  stroke?: RGBA | null;
  strokeWidth?: number;
}

interface InkModule {
  FPDFTextObj_SetTextRenderMode?: (obj: number, mode: number) => boolean;
  FPDFPageObj_SetStrokeColor?: (
    obj: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => boolean;
  FPDFPageObj_SetStrokeWidth?: (obj: number, width: number) => boolean;
}

// How a run's glyphs are painted, other than the fill. Spread as a unit so a
// call site cannot carry the render mode and forget the outline.
export function inkFromRun(run: {
  renderMode?: number;
  stroke?: RGBA | null;
  strokeWidth?: number;
}): InkState {
  return {
    renderMode: run.renderMode,
    stroke: run.stroke ?? null,
    strokeWidth: run.strokeWidth,
  };
}

/** Re-apply render mode and outline to freshly created text objects. */
export function applyInkState(
  m: WrappedPdfiumModule,
  ptrs: number[],
  ink: InkState,
): void {
  const mod = m as unknown as InkModule;
  const mode = ink.renderMode ?? 0;
  const stroke = ink.stroke ?? null;
  const width = ink.strokeWidth ?? 0;
  for (const p of ptrs) {
    if (!p) continue;
    try {
      // Written unconditionally: skipping mode 0 means nothing could ever put
      // an object back to fill-only, so undoing an outline left it stroked.
      mod.FPDFTextObj_SetTextRenderMode?.(p, mode);
      if (stroke) {
        mod.FPDFPageObj_SetStrokeColor?.(
          p,
          stroke.r,
          stroke.g,
          stroke.b,
          stroke.a,
        );
        mod.FPDFPageObj_SetStrokeWidth?.(p, width);
      } else {
        // A transparent zero-width stroke is how "no outline" is expressed.
        mod.FPDFPageObj_SetStrokeWidth?.(p, 0);
        mod.FPDFPageObj_SetStrokeColor?.(p, 0, 0, 0, 0);
      }
    } catch {
      /* best-effort */
    }
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
