import {
  drawnCodePoint,
  drawnText,
} from "@editor/tools/pdfTextEditor/pdfium/lineEndHyphen";
import { readUtf16 } from "@editor/services/pdfiumService";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@editor/tools/pdfTextEditor/model/TextRun";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { RGBA } from "@editor/tools/pdfTextEditor/types";
import {
  emitCharcodeEvent,
  setCharcodesOn,
  tryResolveCharcodes,
} from "@editor/tools/pdfTextEditor/charcode/charcodeRegistry";
import { getActiveCharcodeStrategy } from "@editor/tools/pdfTextEditor/charcode/CharcodeStrategy";
import { emitFallbackTextObject } from "@editor/tools/pdfTextEditor/util/fallbackFont";
import { emitDeviceFontTextObject } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  hasRtl,
  isRtlBase,
  visualOrder,
} from "@editor/tools/pdfTextEditor/util/bidi";
import {
  needsArabicShaping,
  shapeArabic,
} from "@editor/tools/pdfTextEditor/util/arabicShaping";
import {
  noteUndrawnScriptText,
  scriptFaceFamilyFor,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { getExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  advanceWidth,
  parseFontMetrics,
  type FontMetrics,
} from "@editor/tools/pdfTextEditor/util/fontMetrics";
import { applyTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  sliceTags,
  taggedSpans,
  uniformTags,
  type TaggedSpan,
  type TextTags,
} from "@editor/tools/pdfTextEditor/model/TextTags";
import {
  encodesInBase14,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";

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

// Pointers the emit path produced from an already-validated charcode→glyph
// mapping; `isVerifiedPerCharPtr` lets callers skip re-measuring them.
const perCharBranchPtrs = new Set<number>();

// (fontPtr:char) pairs a read-back has PROVEN render faithfully via SetText.
const readBackValidated = new Set<string>();

/** Caller check: is this a pointer the emit path already validated? */
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

/** Stop warning about `chars` once something draws them. */
export function forgetDroppedChars(chars: string): void {
  for (const ch of chars) droppedBase14Chars.delete(ch);
}

export function recordUndrawableChars(chars: string): void {
  recordDroppedChars(chars, "");
}

let measuring = false;

/** Run `measure`, which emits text only to size it, without adding to the characters a save warns were dropped. */
export function withoutDroppedChars<T>(measure: () => T): T {
  const was = measuring;
  measuring = true;
  try {
    return measure();
  } finally {
    measuring = was;
  }
}

/** Record every VISIBLE char present in `original` but missing from `kept`. */
function recordDroppedChars(original: string, kept: string): void {
  if (measuring) return;
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

// Whether a font can encode a given character, keyed by font pointer. Replace
// all rewrites every matching run, so resolving per run made the click block.
const charCoverage = new Map<number, Map<string, boolean>>();

/** Doc-scoped reset: PDFium reuses font pointers across documents. */
export function resetCharCoverageCache(): void {
  charCoverage.clear();
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
  let perFont = charCoverage.get(fontPtr);
  if (!perFont) {
    perFont = new Map();
    charCoverage.set(fontPtr, perFont);
  }
  // Distinct characters only: a long string costs no more than its alphabet.
  for (const ch of new Set([...text])) {
    const known = perFont.get(ch);
    if (known === false) return false;
    if (known === true) continue;
    let ok = false;
    try {
      const resolved = tryResolveCharcodes(
        fontPtr,
        ch,
        { module: m, pagePtr, docPtr },
        true,
      );
      const r = resolved?.result;
      ok = !!r && r.coverage === 1 && r.charcodes.length === 1;
    } catch {
      ok = false;
    }
    // Only memoise a POSITIVE result. A miss here can simply mean the
    // charcode cache was cold, and caching that as "this font cannot encode
    // this character" made the failure permanent for the session.
    if (ok) perFont.set(ch, true);
    else return false;
  }
  return true;
}

const glyphOutlines = new Map<number, Map<string, boolean>>();

/**
 * True when `fontPtr` has an outline for some of `text`'s letters but not all:
 * a subset font maps the rest to a code it holds no glyph for, so they draw blank.
 * A font PDFium cannot read outlines from at all is not judged.
 */
export function lacksGlyphsFor(
  m: WrappedPdfiumModule,
  fontPtr: number,
  text: string,
): boolean {
  if (!fontPtr) return false;
  let perFont = glyphOutlines.get(fontPtr);
  if (!perFont) {
    perFont = new Map();
    glyphOutlines.set(fontPtr, perFont);
  }
  let drawn = false;
  let blank = false;
  // Control and private-use codes reach a glyph by the font's own code, never by Unicode.
  for (const ch of new Set(text.replace(/[\s\p{C}]+/gu, ""))) {
    let has = perFont.get(ch);
    if (has === undefined) {
      try {
        has = !!m.FPDFFont_GetGlyphPath(fontPtr, ch.codePointAt(0)!, 12);
      } catch {
        has = false;
      }
      perFont.set(ch, has);
    }
    if (has) drawn = true;
    else blank = true;
  }
  return drawn && blank;
}

/** Strip characters a base-14 (WinAnsi) font cannot render. */
export function sanitizeForBase14(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      out += ch;
    } else if (cp === 0x00a0) {
      out += " ";
    } else if (encodesInBase14(cp)) {
      out += ch;
    }
    // else: unrepresentable in base-14 - drop it (no tofu).
  }
  return out;
}

/** Every PDFium pointer that backs a run. */
export function collectMemberPtrs(
  run: Pick<
    TextRun,
    | "paragraphLeafPtrs"
    | "paragraphMemberPtrs"
    | "mergedFromPtrs"
    | "pdfiumObjPtr"
  >,
): number[] {
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

/** Detach a text object from its form XObject or, as text typed into a form run is drawn there, the page; false if neither held it. */
export function removeTextObject(
  m: WrappedPdfiumModule,
  page: Page,
  ptr: number,
  containerPtr: number,
): boolean {
  const formMod = m as unknown as FormRemovalModule;
  if (containerPtr && formMod.FPDFFormObj_RemoveObject) {
    try {
      if (formMod.FPDFFormObj_RemoveObject(containerPtr, ptr)) return true;
    } catch {
      /* fall back to the page */
    }
  }
  try {
    const removed = m.FPDFPage_RemoveObject(page.pagePtr, ptr);
    return !containerPtr || !!removed;
  } catch {
    return false;
  }
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
  let allOk = true;
  for (const ptr of ptrs) {
    if (!ptr) {
      allOk = false;
      continue;
    }
    const container = containerByPtr.get(ptr) ?? fallbackContainerPtr;
    if (!removeTextObject(m, page, ptr, container)) allOk = false;
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
  // Required so every emit decides: a re-emit of existing text passes that
  // text's tags, new content passes none. Each stretch with tags of its own
  // is drawn as objects of its own.
  tags: TextTags;
  // Extra advance per glyph in PDF points - the source run's rendered
  // letter-spacing (Tc), inferred at read time.
  charSpacingPt?: number;
  // Optional sink for the text each returned pointer carries, parallel to the
  // return value. The emit branches chunk by word, by character, or not at all,
  // so callers that must map pointers back onto the source string cannot guess
  // it - and reading it back costs a full page text extraction per line.
  outTexts?: string[];
  /** Stretches of `text` to draw in fonts of their own, each ending at `end`; a re-emitted line keeps each word's bold or italic face. */
  fontSpans?: readonly FontSpan[];
  /** Set when `text` is already in the order its glyphs are drawn, left to right. */
  drawnInOrder?: boolean;
  /** Draw `text` as one object, spaces included, instead of one per word. */
  oneObject?: boolean;
  /** Draw in `originalFontPtr` only the words whose every character it provably maps; the others take the fallback. */
  originalFontForCoveredWords?: boolean;
}

export interface FontSpan {
  end: number;
  fontPtr: number;
  /** The base-14 or completion family for characters `fontPtr` cannot draw. */
  fallbackFamily?: string;
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

function embeddedMetricsFor(family: string): FontMetrics | null {
  const bytes = getExternalFontBytes(family);
  return bytes ? parseFontMetrics(bytes) : null;
}

const BASE14_SPACE: Array<[RegExp, number]> = [
  [/^times/i, 250],
  [/^courier/i, 600],
  [/^helvetica/i, 278],
];

export function base14SpaceAdvance(family: string): number | null {
  return BASE14_SPACE.find(([re]) => re.test(family))?.[1] ?? null;
}

/** Measure the natural advance width of `s` in PDF points. */
function measureAdvancePt(
  text: string,
  fontFamily: string,
  fontSizePt: number,
): number {
  const metrics = embeddedMetricsFor(fontFamily);
  const embedded = metrics ? advanceWidth(metrics, text) : null;
  if (embedded !== null) return (embedded * fontSizePt) / 1000;
  const ctx = measureCtx();
  if (!ctx) {
    const space = base14SpaceAdvance(fontFamily) ?? 500;
    let sum = 0;
    for (const ch of text) sum += /\s/.test(ch) ? space : 500;
    return (sum * fontSizePt) / 1000;
  }
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
  FPDFText_GetCharOrigin?: (
    tp: number,
    i: number,
    x: number,
    y: number,
  ) => boolean;
}

// A measured advance below this many ems is treated as an ink box mistaken for
// an advance - that collapse is what stacked Type 3 glyphs onto each other.
//
// This is a deliberate trade-off, not a safe floor: real faces do go under it
// (Garamond's "i" is 0.177em), and such a glyph falls through to an estimated
// metric that can be ~25% wide. Lowering the threshold is not the fix - the
// Type 3 ink boxes it exists to reject measure about 0.12em, so there is no
// gap between the two populations to separate them cleanly.
const MIN_PLAUSIBLE_ADVANCE_EM = 0.18;
// Above this, the "advance" swallowed a word gap or a Td jump.
const MAX_PLAUSIBLE_ADVANCE_EM = 2;

/** Baseline origin of char `idx` in page points, or null when unreadable. */
function charOriginPt(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  tp: number,
  idx: number,
): { x: number; y: number } | null {
  const mod = m as unknown as LooseBoxModule;
  if (!mod.FPDFText_GetCharOrigin) return null;
  // FPDFText_GetCharOrigin takes two double* out-params.
  const buf = scratchPtr(m, SCRATCH.editOrigin, 16);
  try {
    if (!mod.FPDFText_GetCharOrigin(tp, idx, buf, buf + 8)) return null;
    return {
      x: m.pdfium.getValue(buf, "double"),
      y: m.pdfium.getValue(buf + 8, "double"),
    };
  } catch {
    return null;
  }
}

function looseBoxAdvancePt(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  tp: number,
  idx: number,
): number | null {
  const mod = m as unknown as LooseBoxModule;
  if (!mod.FPDFText_GetLooseCharBox) return null;
  const buf = scratchPtr(m, SCRATCH.editLoose, 16);
  try {
    if (!mod.FPDFText_GetLooseCharBox(tp, idx, buf)) return null;
    const heap = (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
    const f32 = new Float32Array(heap.buffer, buf, 4);
    const width = f32[2] - f32[0];
    return width > 0 ? width : null;
  } catch {
    return null;
  }
}

/** |scale| of a page object's matrix (1 when unreadable). */
function objMatrixScale(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  objPtr: number,
): number {
  const buf = scratchPtr(m, SCRATCH.editMatrix, 6 * 4);
  try {
    if (!m.FPDFPageObj_GetMatrix(objPtr, buf)) return 1;
    const a = m.pdfium.getValue(buf, "float");
    const b = m.pdfium.getValue(buf + 4, "float");
    const s = Math.hypot(a, b);
    return s > 0 ? s : 1;
  } catch {
    return 1;
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
      const u = drawnCodePoint(mod.FPDFText_GetUnicode(tp, i));
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
      // The loose char box is the glyph's own advance, which is what the emit
      // path wants: it re-applies the run's letter-spacing itself. On Type 3
      // faces (Figma/Skia exports) PDFium degrades it to the tight ink box,
      // which collapses every advance and stacks the glyphs on re-emit - so
      // an implausible value falls through to the pen movement on the page.
      // That gap includes any Tc the producer used, but an advance that is
      // slightly too wide beats one that is zero.
      let advEm: number | null = null;
      const adv = looseBoxAdvancePt(m, tp, i);
      const looseEm = adv == null ? null : adv / effFs;
      if (
        looseEm != null &&
        looseEm >= MIN_PLAUSIBLE_ADVANCE_EM &&
        looseEm <= MAX_PLAUSIBLE_ADVANCE_EM
      ) {
        advEm = looseEm;
      } else {
        const here = charOriginPt(m, tp, i);
        const next = i + 1 < count ? charOriginPt(m, tp, i + 1) : null;
        if (here && next && Math.abs(next.y - here.y) < 0.5) {
          const delta = (next.x - here.x) / effFs;
          if (
            delta >= MIN_PLAUSIBLE_ADVANCE_EM &&
            delta <= MAX_PLAUSIBLE_ADVANCE_EM
          ) {
            advEm = delta;
          }
        }
      }
      // No trustworthy measurement: leave the char unmapped so the caller
      // falls back to font metrics rather than advancing by ~nothing.
      if (advEm == null) continue;
      fm.set(u, advEm);
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

/**
 * Build the page's advance map now, while every source glyph is still on the
 * page.
 *
 * The map is the only place a Type 3 glyph's real advance can come from, and
 * an edit removes the objects it is measured off. Warming it first is what
 * lets a re-emit keep the original face instead of collapsing.
 */
export function warmOnPageAdvances(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  pagePtr: number,
): void {
  if (!pagePtr || onPageAdvCache.has(pagePtr)) return;
  try {
    onPageAdvCache.set(pagePtr, buildOnPageAdvMap(m, pagePtr));
  } catch {
    /* best-effort - callers fall back to font metrics */
  }
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
  // a,b alone cannot tell a mirrored generator from upright text - both read
  // sin~=0 / cos>0 - so the determinant decides.
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
  if (!opts.drawnInOrder && hasRtl(opts.text)) return emitInVisualOrder(opts);
  if (opts.fontSpans && opts.fontSpans.length > 1)
    return emitFontSpans(opts, opts.fontSpans);
  const spans = taggedSpans(opts.tags, opts.text.length);
  if (spans.length > 1) return emitTaggedSpans(opts, spans);
  const tagMarks = spans[0]?.tags ?? [];
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
    applyTagMarks(m, opts.doc.docPtr, ptrs, tagMarks);
    return ptrs;
  };

  // Letters the page already draws in the font are proof it has them, where a charcode resolver can come up empty.
  const fontDraws = (font: number, text: string): boolean =>
    charcodesResolveFully(m, font, text, opts.page.pagePtr, opts.doc.docPtr) ||
    [...text].every(
      (ch) => onPageAdvanceEm(m, opts.page.pagePtr, font, ch) !== null,
    );

  const emitBase14 = (text: string, x: number): number => {
    // base-14 can only render WinAnsi; drop the rest so PDFium never emits
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
    // Some chars are outside base-14's WinAnsi range.
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
      const scriptFamily = scriptFaceFamilyFor(text);
      const sp = scriptFamily
        ? emitDeviceFontTextObject(
            opts.doc,
            opts.page,
            scriptFamily,
            text,
            size,
            opts.fill,
            x,
            opts.y,
          )
        : 0;
      if (sp) return sp;
      // Nothing loaded draws these chars, so the base-14 emit below drops them until their script's fonts arrive.
      if (!measuring) noteUndrawnScriptText(text);
      recordDroppedChars(text, base14Text);
    }
    if (base14Text.length === 0) return 0; // nothing representable - drop
    const p = newBase14();
    if (!p) return 0;
    setTextOn(m, p, base14Text);
    applyFillAndPos(m, opts.page, p, opts.fill, x, opts.y);
    return p;
  };

  // Emit ONE word at (x, y) and return its pointer (0 on failure).
  const emitWord = (text: string, x: number): number => {
    if (!canReuse) {
      // Still record the attempt: this is the only signal that an edit fell
      // back instead of reusing the source face.
      emitCharcodeEvent({
        timestamp: 0,
        strategy: getActiveCharcodeStrategy(),
        text,
        fontPtr: opts.originalFontPtr,
        resolved: [],
        missing: [...text],
        note:
          opts.originalFontPtr !== 0
            ? "source font cannot author glyphs (Type 3 / no font program) - substituting"
            : "no source font available (Helvetica fresh emit)",
        outcome: "no-font",
      });
      return emitBase14(text, x);
    }

    if (
      opts.originalFontForCoveredWords &&
      !fontDraws(opts.originalFontPtr, text.replace(/\s+/g, ""))
    )
      return emitBase14(text, x);
    const ptr = m2.FPDFPageObj_CreateTextObj!(
      opts.doc.docPtr,
      opts.originalFontPtr,
      size,
    );
    if (!ptr) return emitBase14(text, x);
    // Reuse path: resolve real font charcodes so the embedded subset font
    // renders the chars; falls back to SetText internally.
    const strategyUsed = writeViaCharcodesOrSetText(ptr, text);
    applyFillAndPos(m, opts.page, ptr, opts.fill, x, opts.y);
    const right = measureObjRightEdgePt(m, ptr);
    const visible = text.replace(/\s+/g, "").length;
    // Narrowest base-14 glyph ("i") is ~0.22em; anything well under ~0.15em
    // per visible char means the reused font produced .notdef / 0-width.
    const minExpected = visible * size * 0.15;
    if (visible > 0 && right - x < minExpected) {
      removeAndDestroyObject(m, opts.page.pagePtr, ptr);
      return (
        (strategyUsed !== null && emitWithSetText(text, x)) ||
        emitBase14(text, x)
      );
    }
    if (
      strategyUsed === null &&
      lacksGlyphsFor(m, opts.originalFontPtr, text)
    ) {
      removeAndDestroyObject(m, opts.page.pagePtr, ptr);
      return emitBase14(text, x);
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
          // Readers return right-to-left text in reading order, not the drawn order written here.
          const norm = (s: string) =>
            hasRtl(s)
              ? [...s.replace(/\s+/g, "")].sort().join("")
              : s.replace(/\s+/g, "");
          if (norm(got) !== norm(text)) {
            removeAndDestroyObject(m, opts.page.pagePtr, ptr);
            return emitBase14(text, x);
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
          removeAndDestroyObject(m, opts.page.pagePtr, ptr);
          return emitWithSetText(text, x) || emitBase14(text, x);
        }
      }
      // With no advance to compare, the width says nothing; the font's own mapping still tells a wrong code from a right one.
      if ([...text.trim()].length === 1 && !readsBackAs(ptr, text)) {
        removeAndDestroyObject(m, opts.page.pagePtr, ptr);
        return emitWithSetText(text, x) || emitBase14(text, x);
      }
    }
    return ptr;
  };

  // A guessed code that reads back as another character drew that character. A font that reads back nothing has no mapping to judge by.
  function readsBackAs(ptr: number, text: string): boolean {
    const got = readBackTextObj(m, opts.page.pagePtr, ptr);
    if (got === null || got.trim() === "") return true;
    return got.trim() === text.trim();
  }

  // A wrong charcode guess says nothing about the font's own text mapping, which draws every longer word.
  function emitWithSetText(text: string, x: number): number {
    if (lacksGlyphsFor(m, opts.originalFontPtr, text)) return 0;
    const ptr = m2.FPDFPageObj_CreateTextObj!(
      opts.doc.docPtr,
      opts.originalFontPtr,
      size,
    );
    if (!ptr) return 0;
    setTextOn(m, ptr, text);
    applyFillAndPos(m, opts.page, ptr, opts.fill, x, opts.y);
    const visible = text.replace(/\s+/g, "");
    const got = readBackTextObj(m, opts.page.pagePtr, ptr);
    const sameChars = (a: string, b: string) =>
      [...a].sort().join("") === [...b].sort().join("");
    if (
      got !== null &&
      sameChars(got.replace(/\s+/g, ""), visible) &&
      measureObjRightEdgePt(m, ptr) - x >= visible.length * size * 0.15
    )
      return ptr;
    removeAndDestroyObject(m, opts.page.pagePtr, ptr);
    return 0;
  }

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
    // Code points, not UTF-16 units: the resolver counts per code point,
    // so an astral char (emoji, CJK Ext-B) never matched text.length.
    const cpLen = [...text].length;
    if (r && r.coverage === cpLen && r.charcodes.length === cpLen) {
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
    // One face for the whole word: letters the source font has would otherwise keep it while the rest fall back.
    const wholeWordFallback =
      !!opts.originalFontForCoveredWords &&
      canReuse &&
      !fontDraws(opts.originalFontPtr, opts.text);
    for (const ch of opts.text) {
      const ptr = wholeWordFallback
        ? emitBase14(ch, cursor)
        : emitWord(ch, cursor);
      if (ptr) {
        ptrs.push(ptr);
        opts.outTexts?.push(ch);
      }
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
  // A turned line stays one object too: words drawn apart along a turned baseline read back as separate lines.
  if (!hasAnyWhitespace || opts.oneObject || opts.rotation) {
    const ptr = emitWord(opts.text, opts.x);
    if (ptr) opts.outTexts?.push(opts.text);
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
      const chunkTexts: string[] = [];
      const wordPtrs = emitTextLine({
        ...opts,
        text: chunk.text,
        x: cursor,
        rotation: undefined,
        tags: uniformTags(tagMarks),
        outTexts: chunkTexts,
      });
      if (wordPtrs.length === 0) continue;
      if (opts.outTexts) opts.outTexts.push(...chunkTexts);
      const rightEdge = drawnEndPt(m, wordPtrs, chunkTexts, size);
      // Only trust the measured edge when it advanced by a believable amount:
      // a face PDFium can't measure reports a near-zero ink box and would put
      // the next word on top of this one.
      const metric = measureAdvancePt(chunk.text, family, size);
      const advanced = rightEdge > cursor ? rightEdge - cursor : 0;
      cursor += advanced >= metric * 0.35 ? advanced : metric;
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

// A reader reverses the letters of each right-to-left object but orders a left-to-right line's objects by position, so each right-to-left run inside one is drawn as a single object, spaces and all.
function emitDirectionRuns(
  opts: CreatedTextOptions,
  rightToLeft: readonly boolean[],
): number[] {
  const m = opts.doc.module;
  const size = Math.max(4, opts.fontSize);
  const family = opts.fallbackFamily ?? "Helvetica";
  const spacing = opts.charSpacingPt ?? 0;
  const ptrs: number[] = [];
  let x = opts.x;
  let start = 0;
  while (start < opts.text.length) {
    let end = start + 1;
    while (end < opts.text.length && rightToLeft[end] === rightToLeft[start])
      end++;
    const text = opts.text.slice(start, end);
    const ink = text.trimEnd();
    const texts: string[] = [];
    const spans = sliceFontSpans(opts.fontSpans, start, end);
    const font = spans[0]?.fontPtr || opts.originalFontPtr;
    // A font with no space glyph cannot hold the run whole; its words stay apart.
    const whole =
      rightToLeft[start] &&
      (!font ||
        charcodesResolveFully(
          m,
          font,
          " ",
          opts.page.pagePtr,
          opts.doc.docPtr,
        ));
    const own = ink.trim()
      ? emitTextLine({
          ...opts,
          text,
          x,
          rotation: undefined,
          oneObject: whole,
          fontSpans: spans.length > 1 ? spans : undefined,
          originalFontPtr: font,
          fallbackFamily: spans[0]?.fallbackFamily ?? opts.fallbackFamily,
          outTexts: texts,
        })
      : [];
    opts.outTexts?.push(...texts);
    ptrs.push(...own);
    const drawnEnd =
      own.length > 0
        ? drawnEndPt(m, own, texts, size)
        : x + measureAdvancePt(ink, family, size);
    const trailing = text.slice(ink.length);
    x =
      Math.max(x, drawnEnd) +
      (trailing
        ? measureAdvancePt(trailing, family, size) + spacing * trailing.length
        : 0);
    start = end;
  }
  const rot = opts.rotation;
  if (rot)
    for (const ptr of ptrs)
      rotateObjectAbout(m, ptr, opts.x, opts.y, rot.cos, rot.sin);
  return ptrs;
}

function sliceFontSpans(
  spans: readonly FontSpan[] | undefined,
  start: number,
  end: number,
): FontSpan[] {
  const out: FontSpan[] = [];
  let from = 0;
  for (const span of spans ?? []) {
    if (span.end > start && from < end)
      out.push({ ...span, end: Math.min(span.end, end) - start });
    from = span.end;
  }
  return out;
}

// Each drawn position takes the font of the character it shows.
function visualFontSpans(
  spans: readonly FontSpan[] | undefined,
  order: readonly number[],
): FontSpan[] | undefined {
  if (!spans || spans.length < 2) return undefined;
  const spanAt = (index: number) =>
    spans.find((span) => index < span.end) ?? spans[spans.length - 1];
  const out: Array<FontSpan & { source: FontSpan }> = [];
  order.forEach((index, drawn) => {
    const source = spanAt(index);
    const last = out[out.length - 1];
    if (last && last.source === source) last.end = drawn + 1;
    else out.push({ ...source, end: drawn + 1, source });
  });
  return out.map(({ end, fontPtr, fallbackFamily }) => ({
    end,
    fontPtr,
    fallbackFamily,
  }));
}

// Glyphs are drawn left to right in content order, so right-to-left text goes in reordered; each object still reports the logical stretch it shows.
function emitInVisualOrder(opts: CreatedTextOptions): number[] {
  const shaped = needsArabicShaping(opts.text) ? shapeArabic(opts.text) : null;
  const rtlBase = isRtlBase(opts.text);
  const { visual, order, rightToLeft } = visualOrder(
    shaped?.text ?? opts.text,
    rtlBase,
  );
  const starts = order.map((i) => (shaped ? shaped.source[i] : i));
  const ends = order.map((i) => (shaped ? shaped.sourceEnd[i] : i + 1));
  const drawn: string[] = [];
  const fontSpans = visualFontSpans(opts.fontSpans, starts);
  const drawnOpts: CreatedTextOptions = {
    ...opts,
    text: visual,
    drawnInOrder: true,
    fontSpans,
    tags: uniformTags(taggedSpans(opts.tags, opts.text.length)[0]?.tags ?? []),
    outTexts: drawn,
  };
  const ptrs = rtlBase
    ? emitTextLine(drawnOpts)
    : emitDirectionRuns(drawnOpts, rightToLeft);
  const shown: Array<{ ptr: number; text: string; start: number }> = [];
  let cursor = 0;
  ptrs.forEach((ptr, i) => {
    const text = drawn[i] ?? "";
    const at = visual.indexOf(text, cursor);
    if (at < 0 || !text) {
      shown.push({ ptr, text, start: Infinity });
      return;
    }
    const start = Math.min(...starts.slice(at, at + text.length));
    const end = Math.max(...ends.slice(at, at + text.length));
    shown.push({ ptr, text: opts.text.slice(start, end), start });
    cursor = at + text.length;
  });
  // A reader reverses each right-to-left object's letters but, in a left-to-right line, takes the objects in content order.
  if (!rtlBase) {
    shown.sort((a, b) => a.start - b.start);
    const m = opts.doc.module;
    for (const { ptr } of shown) {
      m.FPDFPage_RemoveObject(opts.page.pagePtr, ptr);
      m.FPDFPage_InsertObject(opts.page.pagePtr, ptr);
    }
  }
  opts.outTexts?.push(...shown.map(({ text }) => text));
  return shown.map(({ ptr }) => ptr);
}

/**
 * Draw each span of `opts.text` with its own tags, one after another along
 * the line.
 */
function emitFontSpans(
  opts: CreatedTextOptions,
  spans: readonly FontSpan[],
): number[] {
  const m = opts.doc.module;
  const size = Math.max(4, opts.fontSize);
  const family = opts.fallbackFamily ?? "Helvetica";
  const spacing = opts.charSpacingPt ?? 0;
  const ptrs: number[] = [];
  let cursor = opts.x;
  let start = 0;
  for (const span of spans) {
    const { end, fontPtr } = span;
    const text = opts.text.slice(start, end);
    const texts: string[] = [];
    const own = emitTextLine({
      ...opts,
      text,
      x: cursor,
      rotation: undefined,
      fontSpans: undefined,
      originalFontPtr: fontPtr || opts.originalFontPtr,
      fallbackFamily: span.fallbackFamily ?? opts.fallbackFamily,
      tags: sliceTags(opts.tags, start, end),
      outTexts: texts,
    });
    opts.outTexts?.push(...texts);
    ptrs.push(...own);
    // Advanced as emitTaggedSpans advances, so splitting a line by font does not move its words.
    const ink = text.trimEnd();
    const gap = text.slice(ink.length);
    const right = Math.max(cursor, drawnEndPt(m, own, texts, size));
    const metric = measureAdvancePt(ink, family, size);
    cursor += right - cursor >= metric * 0.35 ? right - cursor : metric;
    cursor += gap
      ? measureAdvancePt(gap, family, size) + spacing * (gap.length + 1)
      : spacing;
    start = end;
  }
  const rot = opts.rotation;
  if (rot) {
    for (const ptr of ptrs) {
      rotateObjectAbout(m, ptr, opts.x, opts.y, rot.cos, rot.sin);
    }
  }
  return ptrs;
}

function emitTaggedSpans(
  opts: CreatedTextOptions,
  spans: readonly TaggedSpan[],
): number[] {
  const m = opts.doc.module;
  const size = Math.max(4, opts.fontSize);
  const family = opts.fallbackFamily ?? "Helvetica";
  const spacing = opts.charSpacingPt ?? 0;
  const ptrs: number[] = [];
  let cursor = opts.x;
  for (const { start, end, tags } of spans) {
    const text = opts.text.slice(start, end);
    const texts: string[] = [];
    const own = emitTextLine({
      ...opts,
      text,
      x: cursor,
      rotation: undefined,
      tags: uniformTags(tags),
      outTexts: texts,
    });
    opts.outTexts?.push(...texts);
    ptrs.push(...own);
    // Advanced as the per-word loop in emitTextLine advances, so splitting a
    // line by tags does not move its words.
    const ink = text.trimEnd();
    const gap = text.slice(ink.length);
    const right = Math.max(cursor, drawnEndPt(m, own, texts, size));
    const metric = measureAdvancePt(ink, family, size);
    cursor += right - cursor >= metric * 0.35 ? right - cursor : metric;
    cursor += gap
      ? measureAdvancePt(gap, family, size) + spacing * (gap.length + 1)
      : spacing;
  }
  const rot = opts.rotation;
  if (rot) {
    for (const ptr of ptrs) {
      rotateObjectAbout(m, ptr, opts.x, opts.y, rot.cos, rot.sin);
    }
  }
  return ptrs;
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
// Read what several objects actually carry, through ONE text page. Callers that
// need to map emitted pointers back onto their source string must not assume a
// chunking: emitTextLine may produce one object per word, per char, or one for
// the whole string depending on which branch rendered it.
export function readObjTexts(
  m: WrappedPdfiumModule,
  pagePtr: number,
  objPtrs: number[],
): Array<string | null> {
  const mod = m as unknown as TextObjReadModule;
  const out: Array<string | null> = objPtrs.map(() => null);
  if (
    !mod.FPDFText_LoadPage ||
    !mod.FPDFTextObj_GetText ||
    !mod.FPDFText_ClosePage
  ) {
    return out;
  }
  const tp = mod.FPDFText_LoadPage(pagePtr);
  if (!tp) return out;
  try {
    for (let i = 0; i < objPtrs.length; i += 1) {
      const objPtr = objPtrs[i];
      if (!objPtr) continue;
      try {
        const len = mod.FPDFTextObj_GetText(objPtr, tp, 0, 0);
        if (len <= 2) {
          out[i] = "";
          continue;
        }
        const buf = scratchPtr(m, SCRATCH.editRunText, len);
        mod.FPDFTextObj_GetText(objPtr, tp, buf, len);
        out[i] = drawnText(readUtf16(m, buf, len));
      } catch {
        out[i] = null;
      }
    }
  } finally {
    try {
      mod.FPDFText_ClosePage(tp);
    } catch {
      /* best-effort */
    }
  }
  return out;
}

function readBackTextObj(
  m: WrappedPdfiumModule,
  pagePtr: number,
  objPtr: number,
): string | null {
  return objectTexts(m, pagePtr, [objPtr])?.[0] ?? null;
}

/** What each object reads as, through one text page; null when the module cannot read text. */
export function objectTexts(
  m: WrappedPdfiumModule,
  pagePtr: number,
  ptrs: readonly number[],
): string[] | null {
  const mod = m as unknown as TextObjReadModule;
  const getText = mod.FPDFTextObj_GetText;
  if (!mod.FPDFText_LoadPage || !getText || !mod.FPDFText_ClosePage) {
    return null;
  }
  const tp = mod.FPDFText_LoadPage(pagePtr);
  if (!tp) return null;
  try {
    return ptrs.map((objPtr) => {
      const len = getText(objPtr, tp, 0, 0);
      if (len <= 2) return "";
      const buf = scratchPtr(m, SCRATCH.editObjText, len);
      getText(objPtr, tp, buf, len);
      return drawnText(readUtf16(m, buf, len));
    });
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

/** Sum of the drawn font's advances for `text` at `size`, or null when the font cannot map one of its chars. */
function glyphAdvancePt(
  m: WrappedPdfiumModule,
  objPtr: number,
  text: string,
  size: number,
): number | null {
  const fontPtr = m.FPDFTextObj_GetFont(objPtr);
  if (!fontPtr) return null;
  const widthPtr = scratchPtr(m, SCRATCH.emitGlyphWidth, 4);
  let total = 0;
  for (const ch of text) {
    if (!m.FPDFFont_GetGlyphWidth(fontPtr, ch.codePointAt(0)!, size, widthPtr))
      return null;
    const width = m.pdfium.getValue(widthPtr, "float");
    if (!(width > 0)) return null;
    total += width;
  }
  return total;
}

/**
 * Where the next text drawn after `ptrs` should start: each object's origin plus
 * its font's advances, or its ink edge when the font cannot say. Ink alone stops
 * short of the last glyph's advance and pulls every later word in by its side
 * bearing.
 */
function drawnEndPt(
  m: WrappedPdfiumModule,
  ptrs: readonly number[],
  texts: readonly string[],
  size: number,
): number {
  const matrix = scratchPtr(m, SCRATCH.emitMatrix, 24);
  let end = 0;
  for (const [i, ptr] of ptrs.entries()) {
    const ink = measureObjRightEdgePt(m, ptr);
    let right = ink;
    const text = texts.length === ptrs.length ? texts[i].trimEnd() : "";
    const glyphs = text ? glyphAdvancePt(m, ptr, text, size) : null;
    if (glyphs !== null && m.FPDFPageObj_GetMatrix(ptr, matrix)) {
      const scale = m.pdfium.getValue(matrix, "float");
      const fromGlyphs =
        m.pdfium.getValue(matrix + 16, "float") + glyphs * scale;
      if (fromGlyphs >= ink - 0.5 && fromGlyphs <= ink + size * 0.5)
        right = fromGlyphs;
    }
    end = Math.max(end, right);
  }
  return end;
}

interface InsertAtModule {
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    index: number,
  ) => boolean;
}

/** Each of `ptrs` found at page level with its index in the page's content order. */
export function contentIndices(
  m: WrappedPdfiumModule,
  pagePtr: number,
  ptrs: Iterable<number>,
): Map<number, number> {
  const wanted = new Set(ptrs);
  const found = new Map<number, number>();
  const count = m.FPDFPage_CountObjects(pagePtr);
  for (let i = 0; i < count && found.size < wanted.size; i++) {
    const ptr = m.FPDFPage_GetObject(pagePtr, i);
    if (wanted.has(ptr)) found.set(ptr, i);
  }
  return found;
}

/**
 * Put each page-level object back at its index in content order. Text
 * extraction, search and screen readers follow that order, so an edited line
 * whose objects were appended would otherwise read at the end of the page.
 * `placed` must hold every object that moved; anything else keeps its place.
 */
export function restoreContentOrder(
  m: WrappedPdfiumModule,
  pagePtr: number,
  placed: ReadonlyArray<{ ptr: number; index: number }>,
): void {
  const insertAt = (m as unknown as InsertAtModule)
    .FPDFPage_InsertObjectAtIndex;
  if (!insertAt || placed.length === 0) return;
  for (const { ptr } of placed) m.FPDFPage_RemoveObject(pagePtr, ptr);
  for (const { ptr, index } of [...placed].sort((a, b) => a.index - b.index))
    if (!insertAt(pagePtr, ptr, index)) m.FPDFPage_InsertObject(pagePtr, ptr);
}

export function measureObjRightEdgePt(
  m: WrappedPdfiumModule,
  objPtr: number,
): number {
  const buf = scratchPtr(m, SCRATCH.editBoxA, 16);
  if (!m.FPDFPageObj_GetBounds(objPtr, buf, buf + 4, buf + 8, buf + 12)) {
    return 0;
  }
  return m.pdfium.getValue(buf + 8, "float");
}

/**
 * Full page-space box of an object, or null when it cannot be measured.
 *
 * A freshly emitted text object knows its baseline but not its ink extent, and
 * every run READ from the page stores the ink bottom - so a run whose box was
 * estimated instead of measured draws in the wrong place until something
 * recaptures it.
 */
export function measureObjBoxPt(
  m: WrappedPdfiumModule,
  objPtr: number,
): { x: number; y: number; width: number; height: number } | null {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(objPtr, l, b, r, t)) return null;
    const left = m.pdfium.getValue(l, "float");
    const bottom = m.pdfium.getValue(b, "float");
    const right = m.pdfium.getValue(r, "float");
    const top = m.pdfium.getValue(t, "float");
    if (![left, bottom, right, top].every(Number.isFinite)) return null;
    return {
      x: Math.min(left, right),
      y: Math.min(bottom, top),
      width: Math.abs(right - left),
      height: Math.abs(top - bottom),
    };
  } catch {
    // Measuring is never worth failing the mutation that asked for it.
    return null;
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}

/**
 * Horizontal span covered by `ptrs`, or null when nothing is measurable.
 *
 * A fresh overlay emit replaces every object a run owns, so the run's old
 * bounds describe geometry that no longer exists - a stale box leaves the
 * editable overlay the wrong size over correctly drawn text.
 */
export function measureObjSpanPt(
  m: WrappedPdfiumModule,
  ptrs: number[],
): { left: number; right: number } | null {
  const box = measureObjBoundsPt(m, ptrs);
  return box && { left: box.left, right: box.right };
}

export function measureObjBoundsPt(
  m: WrappedPdfiumModule,
  ptrs: number[],
): { left: number; bottom: number; right: number; top: number } | null {
  const buf = scratchPtr(m, SCRATCH.editBoxB, 16);
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const ptr of ptrs) {
    if (!ptr) continue;
    try {
      if (!m.FPDFPageObj_GetBounds(ptr, buf, buf + 4, buf + 8, buf + 12)) {
        continue;
      }
    } catch {
      continue;
    }
    const lo = m.pdfium.getValue(buf, "float");
    const hi = m.pdfium.getValue(buf + 8, "float");
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    left = Math.min(left, lo);
    right = Math.max(right, hi);
    bottom = Math.min(bottom, m.pdfium.getValue(buf + 4, "float"));
    top = Math.max(top, m.pdfium.getValue(buf + 12, "float"));
  }
  return right > left ? { left, bottom, right, top } : null;
}

const LEFT_EDGE_TOLERANCE_PT = 0.02;

/** Shift an object sideways so its inked left edge sits at `x`; one with no ink (a space) is left be. */
export function moveObjectLeftEdgeTo(
  m: WrappedPdfiumModule,
  ptr: number,
  x: number,
): void {
  const span = measureObjSpanPt(m, [ptr]);
  if (!span) return;
  const dx = x - span.left;
  if (Math.abs(dx) > LEFT_EDGE_TOLERANCE_PT) {
    transformObject(m, ptr, 1, 0, 0, 1, dx, 0);
  }
}

function setTextOn(m: WrappedPdfiumModule, ptr: number, text: string): void {
  // FPDFText_SetText copies, so a pooled buffer is safe to overwrite next call.
  const byteLen = (text.length + 1) * 2;
  const textPtr = scratchPtr(m, SCRATCH.editSetText, byteLen);
  m.pdfium.stringToUTF16(text, textPtr, byteLen);
  m.FPDFText_SetText(ptr, textPtr);
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

/** Pen origin for one output line, in raw PDF page space. */
export interface LineOrigin {
  x: number;
  y: number;
}

// THE one place that decides where each re-emitted line's pen starts. Reuse the
// run's existing per-line origins when the line count still matches (so an edit
// keeps the source's exact baselines), otherwise step along the run's rotated
// down-axis: the (0,-lineHeight) vector through [cos,-sin] gives (sin*L,-cos*L).
export function planLineOrigins(
  run: TextRun,
  lineCount: number,
  lineHeight: number,
): LineOrigin[] {
  const rot = rotationFromMatrix(run.matrix);
  const dcos = rot ? rot.cos : 1;
  const dsin = rot ? rot.sin : 0;
  const slots = run.paragraphLineSlots;
  // Line i keeps slot i whenever that slot exists, even when the edit changed
  // the line COUNT: an edit that drops a line must not move the lines above it.
  const last = slots.length > 0 ? slots[slots.length - 1] : null;
  // Past the last known slot, keep the paragraph's own leading. Restarting the
  // ladder at run.matrix instead drops the surviving lines onto the text below.
  const leading = paragraphLeading(slots) || lineHeight;
  const out: LineOrigin[] = [];
  for (let i = 0; i < lineCount; i++) {
    const slot = slots[i];
    if (slot) {
      out.push({ x: slot.matrixE, y: slot.baselineY });
      continue;
    }
    const step = last ? i - (slots.length - 1) : i;
    const baseX = last ? last.matrixE : run.matrix.e;
    const baseY = last ? last.baselineY : run.matrix.f;
    out.push({
      x: baseX + step * leading * dsin,
      y: baseY - step * leading * dcos,
    });
  }
  return out;
}

/** Distance between consecutive line origins, robust under rotation. */
function paragraphLeading(slots: ParagraphLineSlot[]): number {
  if (slots.length < 2) return 0;
  const a = slots[slots.length - 2];
  const b = slots[slots.length - 1];
  return Math.hypot(b.matrixE - a.matrixE, b.baselineY - a.baselineY);
}

/** One re-emitted line: the objects created for it and where they landed. */
export interface EmittedLine {
  ptrs: number[];
  text: string;
  /** Text of each ptr, parallel to `ptrs`. Callers must not re-derive this:
   * emitTextLine emits per word OR per character, and guessing drops ptrs. */
  texts: string[];
  x: number;
  y: number;
}

// THE one place a whole run is re-emitted line by line. Rotation, ink state and
// per-line baselines are applied here so no caller can carry one and drop
// another - that fragmentation is why the same class of bug kept recurring.
export function emitRunLines(opts: {
  doc: EditorDocument;
  page: Page;
  run: TextRun;
  lines: ReadonlyArray<{ text: string; tags: TextTags }>;
  origins: LineOrigin[];
  originalFontPtr: number;
  fallbackFamily: string;
  originalFontSubset?: boolean;
  originalFontForCoveredWords?: boolean;
  /** Per output line, the source fonts to keep within it. */
  fontSpansByLine?: ReadonlyArray<readonly FontSpan[] | undefined>;
}): EmittedLine[] {
  const rot = rotationFromMatrix(opts.run.matrix);
  const out: EmittedLine[] = [];
  for (let i = 0; i < opts.lines.length; i++) {
    const { text, tags } = opts.lines[i];
    const origin = opts.origins[i];
    if (!origin) continue;
    if (text.length === 0) {
      out.push({ ptrs: [], text: "", texts: [], x: origin.x, y: origin.y });
      continue;
    }
    const texts: string[] = [];
    const ptrs = emitTextLine({
      outTexts: texts,
      doc: opts.doc,
      page: opts.page,
      text,
      x: origin.x,
      y: origin.y,
      fontSize: opts.run.fontSize,
      fill: opts.run.fill,
      ...inkFromRun(opts.run),
      originalFontPtr: opts.originalFontPtr,
      originalFontSubset: opts.originalFontSubset,
      originalFontForCoveredWords: opts.originalFontForCoveredWords,
      charSpacingPt: opts.run.charSpacingPt,
      fallbackFamily: opts.fallbackFamily,
      // Keep the run's rotation on re-emit (no-op for upright text).
      rotation: rot,
      tags,
      fontSpans: opts.fontSpansByLine?.[i],
    });
    // A right-to-left line keeps its right edge, where it starts.
    const ink =
      !rot && isRtlBase(text) ? measureObjSpanPt(opts.doc.module, ptrs) : null;
    const shift = ink
      ? opts.run.bounds.x + opts.run.bounds.width - ink.right
      : 0;
    if (ptrs.length > 0 && Number.isFinite(shift) && Math.abs(shift) > 0.05)
      for (const ptr of ptrs)
        transformObject(opts.doc.module, ptr, 1, 0, 0, 1, shift, 0);
    out.push({ ptrs, text, texts, x: origin.x + shift, y: origin.y });
  }
  return out;
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
