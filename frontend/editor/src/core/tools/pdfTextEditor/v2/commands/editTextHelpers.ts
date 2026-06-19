import { writeUtf16 } from "@app/services/pdfiumService";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  emitCharcodeEvent,
  findFontForChar,
  setCharcodesOn,
  tryResolveCharcodes,
} from "@app/tools/pdfTextEditor/v2/charcode/charcodeRegistry";
import { getActiveCharcodeStrategy } from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";
import { emitFallbackTextObject } from "@app/tools/pdfTextEditor/v2/util/fallbackFont";

/**
 * Remove a PAGE-level object and FREE its PDFium allocation.
 *
 * `FPDFPage_RemoveObject` only detaches the object - it transfers ownership to
 * the caller, who must `FPDFPageObj_Destroy` it (or re-insert) or it leaks for
 * the document's lifetime. ONLY use this for objects that are permanently
 * discarded; destroying an object still referenced by an undo snapshot would be
 * a use-after-free.
 */
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

/**
 * Pointers freshly created by the per-char BACKEND emit branch in
 * `emitTextLine`. The partial-edit measure-and-fallback in
 * `applyPartialEditPlan` consults `isVerifiedPerCharPtr` before
 * deciding whether to remove + retry a "tofu" emit: ptrs in this set
 * were created with known-good (font, charcode) pairs from the
 * backend resolver cache, so a 0-width measurement just means the
 * page content stream hasn't been regenerated yet, NOT that the
 * glyph is broken. Without this signal the retry creates a duplicate
 * per-char text object and the original .notdef-stripe ptr can't
 * always be cleanly removed (FPDFPage_RemoveObject silently fails
 * for some Type3 / form-xobject combinations).
 *
 * Entries are weak by convention: the Set grows over the session but
 * each per-char emit is a small int (PDFium handle), so even after a
 * long edit session the memory footprint is negligible. We don't
 * bother removing entries on object delete because the check is
 * one-shot (right after emit) - stale entries are harmless.
 */
const perCharBranchPtrs = new Set<number>();

/** Caller check: was this ptr produced by the per-char emit branch? */
export function isVerifiedPerCharPtr(ptr: number): boolean {
  return perCharBranchPtrs.has(ptr);
}

/** Test-only: clear the verified-ptr set between cases. */
export function _clearVerifiedPerCharPtrsForTests(): void {
  perCharBranchPtrs.clear();
}

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
  doc: EditorDocument;
  page: Page;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: { r: number; g: number; b: number; a: number };
  /** When non-zero, reuse the source font instead of base-14. */
  originalFontPtr: number;
  /**
   * Whether the reused source font is a SUBSET font. Gates the untrusted
   * content-stream charcode guess: only subset fonts (where FPDFText_SetText's
   * reverse Unicode→charcode lookup fails) fall back to the guess. Non-subset
   * fonts render correctly via SetText, so the guess - which picks wrong
   * glyphs for re-encoded fonts - is never used for them.
   */
  originalFontSubset?: boolean;
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

// Per-page cache of each char's ON-PAGE rendered advance (per em), keyed
// pagePtr -> fontPtr -> unicode -> advanceEm. Built once by walking the
// PDFium text page. Used to self-validate a content-stream charcode GUESS:
// after emitting a reused glyph we compare its measured advance to the
// advance the SAME char actually renders at on the page; a wrong CID guess
// produces a grossly different advance and is rejected (-> Helvetica).
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
      const adv = looseBoxAdvancePt(m, tp, i);
      if (adv == null) continue;
      fm.set(u, adv / fs);
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
 * Drop the per-page on-page-advance cache. MUST be called on document switch:
 * it's keyed by raw PDFium page/font pointers, which PDFium reuses across
 * documents - a stale advance would mis-validate the next document's reused-
 * glyph charcode guesses (accept a wrong glyph or reject a correct one).
 */
export function resetOnPageAdvCache(): void {
  onPageAdvCache.clear();
}

/** Test-only alias for {@link resetOnPageAdvCache}. */
export function _clearOnPageAdvCacheForTests(): void {
  resetOnPageAdvCache();
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
  // every whitespace run is now an explicit positional jump. \s (not just
  // [ \t]) so non-breaking / unicode spaces also become gaps, never glyphs.
  const gapRe = /\s+/g;
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
      // Some chars are outside base-14's Latin-1 range. Before dropping them,
      // emit via the bundled Unicode fallback font (Noto Sans, embedded on
      // demand) so non-Latin text is KEPT rather than silently lost. Only
      // kicks in when sanitising actually removed chars, so pure-Latin emits
      // are byte-for-byte unchanged. Returns 0 if the font isn't ready or
      // didn't render (then we fall through to the sanitised base-14 drop).
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
    // Reuse path: resolve real font charcodes (backend/cmap/content-stream)
    // so the embedded subset font renders the chars; falls back to SetText
    // internally. The width check below still catches any .notdef result and
    // re-emits in base-14, so a broken reuse never persists.
    const strategyUsed = writeViaCharcodesOrSetText(ptr, text);
    applyFillAndPos(m, opts.page, ptr, opts.fill, x, opts.y);
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
    // Self-validate an UNTRUSTED content-stream charcode guess: that
    // resolver maps Unicode->CID by glyph order, which can pick a WRONG
    // (but non-.notdef) glyph for re-encoded subsets. Compare the emitted
    // advance to the advance the SAME chars actually render at on the page;
    // a gross mismatch means the guess hit the wrong glyph, so drop it and
    // re-emit in base-14 (right letter, safe font) rather than show a wrong
    // glyph. Trusted strategies (backend/cmap) skip this check.
    if (strategyUsed === "content-stream" && opts.originalFontPtr) {
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

  // Try-charcodes wrapper: when we're reusing a source font AND the
  // active charcode strategy can resolve EVERY char in the chunk,
  // call FPDFText_SetCharcodes directly. Otherwise fall through to
  // FPDFText_SetText (the legacy path). Returns the strategy that
  // successfully wrote charcodes (so the caller can self-validate an
  // untrusted "content-stream" guess), or null when it fell to SetText.
  function writeViaCharcodesOrSetText(
    ptr: number,
    text: string,
  ): string | null {
    const strategy = getActiveCharcodeStrategy();
    // The content-stream resolver is an untrusted sequential-CID GUESS. When it
    // is the ACTIVE strategy (diagnostic builds) it would otherwise bypass the
    // subset+single-codepoint gate that guards it as a fallback - so apply the
    // same gate here. Anything outside it routes to SetText, which the width
    // self-check above backstops with a base-14 re-emit. Without this, a
    // re-encoded multi-char run could be scrambled by a same-width wrong glyph.
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
    // allowContentStreamFallback: if the active resolver (e.g. backend with
    // a cold cache) misses, reuse the on-page glyph via the client-side
    // content-stream resolver.
    //
    // GATED TO SUBSET FONTS, SINGLE CODE POINTS. The content-stream resolver
    // GUESSES each glyph's charcode as its sequential order of first
    // appearance on the page. For re-encoded / non-subset fonts (e.g. LaTeX
    // LMRoman) that guess picks valid-but-WRONG glyphs (e.g. "a"→"fi",
    // "occupying"→garbage), and its only self-check - the per-emit advance
    // ratio - can't tell a same-width wrong glyph apart. Two gates make this
    // safe:
    //   * SUBSET only: non-subset fonts render correctly via SetText (their
    //     reverse Unicode→charcode lookup works), so they never need - and
    //     must never use - the guess. Only subset fonts (where SetText returns
    //     .notdef) fall back to it.
    //   * SINGLE code point only: the advance self-check is a true per-char
    //     check for one char but averages per-char errors across a multi-char
    //     word, so a whole-line re-emit could scramble every word while
    //     passing. Multi-char text uses SetText (correct for non-subset) or
    //     the width check's base-14 re-emit (correct letters for subset).
    // Net: the result is always real glyphs - the original font where it
    // renders, base-14 otherwise - never a scramble.
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

  // Per-char emit branch for the BACKEND strategy. When the active
  // strategy is 'backend', each char's font may be DIFFERENT (Chrome/
  // Skia-style per-glyph-per-font PDFs). For each char we ask the
  // resolver for a charcode AND probe PDFium for the font handle that
  // renders that char on the page. We then create one text object per
  // char with the CORRECT font + charcode, positioning them adjacently
  // so the visual output matches the source font.
  //
  // Fires whenever the backend strategy is active AND every char has
  // both a per-char font handle on the page AND a backend-resolved
  // charcode. The result ptrs are recorded in `perCharBranchPtrs` so
  // the partial-edit measure-and-fallback knows to TRUST them and
  // skip its tofu retry. Without that signal the retry would fire a
  // second per-char emit on top of the first - the F-duplication bug
  // from before.
  //
  // The earlier `!reuse` gate (intended to avoid the double-emit) was
  // too restrictive: with a borrowed font supplied, the per-char
  // branch bailed, the legacy SetText path produced .notdef glyphs
  // (visible as horizontal-bar stripes for Type3 fonts on Sample.pdf),
  // FPDFPage_RemoveObject silently failed to clear those for
  // form-xobject text, and the second consecutive M edit left visible
  // stripes around BOTH the first and the second M. Per-char branch
  // always firing (when it CAN) + verified-ptr signal to skip the
  // retry sidesteps both failure modes.
  //
  // Bails out (falls through to the normal path) when:
  //   - text contains whitespace (whitespace doesn't have a per-char
  //     font on the page; the normal per-chunk path already handles it)
  //   - we're not in backend strategy mode
  //   - ANY char fails to resolve both a font handle AND a charcode
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
    // Probe per char first. If any char fails resolution, fall through
    // to the normal write path (which will surface the failure via
    // emitCharcodeEvent's outcome:partial-coverage-fallback path).
    const perChar: Array<{ ch: string; font: number; charcodes: number[] }> =
      [];
    let allOk = true;
    for (const ch of opts.text) {
      const charFont = findFontForChar(ch, ctx);
      if (!charFont) {
        allOk = false;
        break;
      }
      const resolved = tryResolveCharcodes(charFont, ch, ctx);
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
        if (!ptr) continue;
        const ok = setCharcodesOn(m, ptr, pc.charcodes);
        if (!ok) {
          // Couldn't set charcodes - rare but possible. Tear down the
          // current orphan AND every per-char object already emitted this
          // loop before bailing to the normal path. Leaving the earlier
          // ptrs on the page would double-render the word (the fall-through
          // re-emits it) and leak them.
          removeAndDestroyObject(m, opts.page.pagePtr, ptr);
          for (const p of ptrs) removeAndDestroyObject(m, opts.page.pagePtr, p);
          ptrs.length = 0;
          break;
        }
        applyFillAndPos(m, opts.page, ptr, opts.fill, cursor, opts.y);
        const measured = measureObjRightEdgePt(m, ptr);
        cursor =
          measured > cursor
            ? measured
            : cursor + measureAdvancePt(pc.ch, family, size);
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
        // Mark this ptr as verified - it was created via the per-char
        // branch with a known-good (font, charcode) pair from the
        // backend resolver cache. Downstream callers (the
        // partial-edit measure-and-fallback in applyPartialEditPlan)
        // check this set and SKIP their tofu retry for these ptrs,
        // because the retry would emit a second per-char text object
        // on top and the duplicates can't all be cleanly removed
        // (FPDFPage_RemoveObject silently fails for some Type3 /
        // form-xobject combinations, leaving visible stripes).
        perCharBranchPtrs.add(ptr);
      }
      if (ptrs.length === opts.text.length) return ptrs;
    }
    // fall through to the normal path if per-char attempt didn't work
  }

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
