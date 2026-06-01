import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import {
  emitTextLine,
  measureObjRightEdgePt,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";

/**
 * Diff-driven partial editing. For runs that LineGrouper merged from
 * many sub-objects (per-glyph layout common in InDesign/Quark output),
 * a character-level LCS lets us:
 *   - Keep every sub-object whose chars survived the edit, in its
 *     ORIGINAL font with ORIGINAL byte codes and ORIGINAL glyphs.
 *   - Remove only the sub-objects whose chars were all deleted.
 *   - Emit fresh Helvetica chunks ONLY for chars the user actually
 *     inserted - all other text keeps its source typography.
 *
 * Bails out (returns null) when an edit straddles a multi-char
 * sub-object boundary (some chars in the sub-run kept, some deleted),
 * because splitting a PDFium text object isn't supported. The caller
 * falls back to the per-word Helvetica emit in that rare case.
 */
export interface PartialEditOp {
  type: "keep" | "insert";
  /** keep: sub-run index in run.mergedFromPtrs */
  subRunIdx?: number;
  /** insert: text to emit in fallback font */
  text?: string;
  /**
   * insert only: the original sub-run this insert is replacing (came
   * from a "mixed" sub-run whose kept chars need a new emit). When set,
   * the emit anchors at the original sub-run's x position so the line
   * keeps its source layout. Inserts WITHOUT this field (pure user
   * additions like typing at end-of-line) emit at the running cursor.
   */
  anchorSubRunIdx?: number;
  /**
   * Position in nextText where this op's first char lives. Used by
   * apply to write the correct `mergedFromCharStarts` entry so the
   * stored char-positions stay aligned with the run.text layout
   * (including any LineGrouper-synthesised whitespace gaps that don't
   * belong to any sub-run).
   */
  startBIdx: number;
}

export interface PartialEditPlan {
  removePtrs: Array<{ ptr: number; containerPtr: number }>;
  ops: PartialEditOp[];
  /**
   * Per-sub-run status (parallel to prevMergedFromPtrs). Used by apply
   * to subtract the width of any all-deleted sub-runs that fall between
   * two consecutive keep / anchor ops - otherwise kept text after a
   * fully-deleted sub-run would stay at its original x and leave a
   * visible gap in the saved PDF.
   */
  subRunStatus: Array<"all-kept" | "all-deleted" | "mixed">;
  /** Snapshot of current model arrays for revert. */
  prevMergedFromPtrs: number[];
  prevMergedFromTexts: string[];
  prevMergedFromBounds: Array<{ x: number; right: number }>;
}

function lcsIndices(
  a: string,
  b: string,
): {
  keptA: Set<number>;
  keptB: Set<number>;
  alignment: Array<{ aIdx: number; bIdx: number }>;
} {
  const m = a.length;
  const n = b.length;
  const dp: Int32Array[] = new Array(m + 1);
  for (let i = 0; i <= m; i++) dp[i] = new Int32Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
    }
  }
  const keptA = new Set<number>();
  const keptB = new Set<number>();
  const alignment: Array<{ aIdx: number; bIdx: number }> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      keptA.add(i - 1);
      keptB.add(j - 1);
      alignment.unshift({ aIdx: i - 1, bIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return { keptA, keptB, alignment };
}

export function planPartialEdit(
  run: TextRun,
  prevText: string,
  nextText: string,
): PartialEditPlan | null {
  if (run.mergedFromPtrs.length === 0) return null;
  if (run.mergedFromTexts.length !== run.mergedFromPtrs.length) return null;
  if (run.mergedFromBounds.length !== run.mergedFromPtrs.length) return null;
  if (nextText.length === 0) return null;
  if (prevText === nextText) return null;

  const { keptA, keptB, alignment } = lcsIndices(prevText, nextText);

  // Read per-sub-run char-start positions directly off the run. The
  // gaps between consecutive sub-runs' char-ranges hold LineGrouper-
  // synthesised whitespace that doesn't belong to any PDFium object;
  // those chars stay at -1 (ghost) and are skipped by the ops walk.
  //
  // Earlier versions located sub-runs via prevText.indexOf at plan
  // time, but that broke after a previous edit inserted chars in the
  // MIDDLE of a sub-run's contiguous span (e.g. a kept "e " sub-run
  // gets an "r" inserted between the 'e' and the space). The stored
  // char-start positions are kept up-to-date by applyPartialEditPlan
  // so they always reflect the current run.text layout.
  if (
    run.mergedFromCharStarts.length !== run.mergedFromPtrs.length ||
    run.mergedFromCharStarts.some((s) => s < 0 || s > prevText.length)
  ) {
    // Stale or missing char-starts (e.g. an overlay-path edit cleared
    // the ptrs without also setting char-starts). Bail safely.
    return null;
  }
  const charToSubRun = new Array<number>(prevText.length).fill(-1);
  const subRunRanges: Array<{ start: number; end: number } | null> = [];
  for (let i = 0; i < run.mergedFromTexts.length; i++) {
    const subText = run.mergedFromTexts[i];
    const start = run.mergedFromCharStarts[i];
    const end = start + subText.length;
    if (subText.length === 0) {
      subRunRanges.push({ start, end });
      continue;
    }
    if (end > prevText.length) return null;
    // Sanity check: the stored chars must actually match prevText at
    // that position. Catches model corruption without silent drift.
    if (prevText.slice(start, end) !== subText) return null;
    for (let c = start; c < end; c++) {
      charToSubRun[c] = i;
    }
    subRunRanges.push({ start, end });
  }

  // Classify sub-runs by counting how many of their own chars (the
  // tracked range, not ghost gaps) survived the LCS.
  const subRunStatus: Array<"all-kept" | "all-deleted" | "mixed"> = [];
  const mixedSubRuns = new Set<number>();
  for (let i = 0; i < run.mergedFromTexts.length; i++) {
    const range = subRunRanges[i];
    if (!range) {
      subRunStatus.push("all-kept");
      continue;
    }
    const subLen = range.end - range.start;
    if (subLen === 0) {
      subRunStatus.push("all-kept");
      continue;
    }
    let keptCount = 0;
    for (let c = range.start; c < range.end; c++) {
      if (keptA.has(c)) keptCount += 1;
    }
    if (keptCount === 0) subRunStatus.push("all-deleted");
    else if (keptCount === subLen) subRunStatus.push("all-kept");
    else {
      subRunStatus.push("mixed");
      mixedSubRuns.add(i);
    }
  }

  // Build ops by walking nextText. For each kept char find its sub-run
  // and emit a single "keep" op the first time we see that sub-run.
  // For runs of inserted chars, accumulate into a buffer and flush as
  // one "insert" op when we hit a kept char (or end of next).
  //
  // When an insert buffer's content all came from a SINGLE mixed
  // sub-run, we tag the flushed insert op with that sub-run's idx so
  // applyPartialEditPlan can position the new emit at the original
  // sub-run's x (preserving the source layout's slot for that word
  // instead of pushing everything right by the new-text width).
  const ops: PartialEditOp[] = [];
  let lastSubRun = -1;
  let insertBuf = "";
  let insertAnchorSubRun: number | undefined;
  let insertStartBIdx = 0;
  function flushInsert(): void {
    if (insertBuf.length === 0) return;
    ops.push({
      type: "insert",
      text: insertBuf,
      anchorSubRunIdx: insertAnchorSubRun,
      startBIdx: insertStartBIdx,
    });
    insertBuf = "";
    insertAnchorSubRun = undefined;
  }
  // Map next-bIdx → aIdx via alignment array
  const bToA = new Map<number, number>();
  for (const { aIdx, bIdx } of alignment) bToA.set(bIdx, aIdx);
  for (let b = 0; b < nextText.length; b++) {
    if (keptB.has(b)) {
      const a = bToA.get(b)!;
      const subRunIdx = charToSubRun[a];
      // Ghost char (LineGrouper-synthesised whitespace, not part of any
      // PDFium text object). No keep op needed - the positional gap
      // between the surrounding sub-runs implicitly carries the
      // whitespace. Don't reset lastSubRun either, so two real chars
      // from the same sub-run on either side of a ghost still dedupe.
      if (subRunIdx === -1) continue;
      // Kept chars in mixed sub-runs are treated as inserts so we can
      // emit them via Helvetica fallback (the only chars in the line
      // that lose their original font - the surrounding unchanged
      // sub-runs are fully preserved).
      if (mixedSubRuns.has(subRunIdx)) {
        // First mixed-sub-run char seen sets the anchor; if a later
        // char comes from a DIFFERENT mixed sub-run, drop the anchor
        // (we can only anchor a single insert at one position).
        if (insertBuf.length === 0) {
          insertAnchorSubRun = subRunIdx;
          insertStartBIdx = b;
        } else if (insertAnchorSubRun !== subRunIdx)
          insertAnchorSubRun = undefined;
        insertBuf += nextText[b];
        continue;
      }
      flushInsert();
      if (subRunIdx !== lastSubRun) {
        ops.push({ type: "keep", subRunIdx, startBIdx: b });
        lastSubRun = subRunIdx;
      }
    } else {
      if (insertBuf.length === 0) insertStartBIdx = b;
      insertBuf += nextText[b];
    }
  }
  flushInsert();

  // Collect removals: both all-deleted sub-runs AND mixed sub-runs
  // (mixed sub-runs get re-emitted via Helvetica chunks above).
  const removePtrs: Array<{ ptr: number; containerPtr: number }> = [];
  for (let i = 0; i < run.mergedFromPtrs.length; i++) {
    if (subRunStatus[i] === "all-deleted" || subRunStatus[i] === "mixed") {
      removePtrs.push({
        ptr: run.mergedFromPtrs[i],
        containerPtr: run.containerPtr,
      });
    }
  }

  if (ops.length === 0) return null;

  return {
    removePtrs,
    ops,
    subRunStatus,
    prevMergedFromPtrs: [...run.mergedFromPtrs],
    prevMergedFromTexts: [...run.mergedFromTexts],
    prevMergedFromBounds: run.mergedFromBounds.map((b) => ({ ...b })),
  };
}

let _wsMeasureCanvas: HTMLCanvasElement | null = null;
/**
 * Canvas-measured advance width for whitespace chars. PDFium's
 * FPDFPageObj_GetBounds returns the visible-glyph bounds (zero for
 * a space, since a space has no ink), so when an insert contains
 * whitespace we can't read its advance width back from PDFium. The
 * canvas measurement of the same string in Liberation Sans / the
 * fallback family is close enough for our offset-tracking purposes.
 */
function measureWhitespaceAdvancePt(
  text: string,
  fontFamily: string,
  fontSizePt: number,
): number {
  if (typeof document === "undefined") return text.length * fontSizePt * 0.27;
  if (!_wsMeasureCanvas) _wsMeasureCanvas = document.createElement("canvas");
  const ctx = _wsMeasureCanvas.getContext("2d");
  if (!ctx) return text.length * fontSizePt * 0.27;
  ctx.font = `${fontSizePt}pt ${fontFamily}`;
  return ctx.measureText(text).width;
}

interface FontReadingModule {
  FPDFTextObj_GetFont?: (ptr: number) => number;
}

/**
 * Borrow the font handle from the FIRST surviving sub-object that
 * wasn't slated for removal. Returns 0 if no surviving sub-object
 * has a readable font (or if FPDFTextObj_GetFont isn't exposed).
 */
function borrowFontFromSurvivor(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  plan: PartialEditPlan,
): number {
  const fontMod = m as unknown as FontReadingModule;
  if (!fontMod.FPDFTextObj_GetFont) return 0;
  const removed = new Set(plan.removePtrs.map((r) => r.ptr));
  for (let i = 0; i < plan.prevMergedFromPtrs.length; i++) {
    const ptr = plan.prevMergedFromPtrs[i];
    if (!ptr || removed.has(ptr)) continue;
    try {
      const fontPtr = fontMod.FPDFTextObj_GetFont(ptr);
      if (fontPtr) return fontPtr;
    } catch {
      /* try next survivor */
    }
  }
  return 0;
}

/**
 * Per-char font borrowing: when each glyph in the source PDF lives
 * in its OWN dedicated subset font (the Adobe / Creative Cloud
 * pattern - e.g. "10M+" with 4 separate fonts for 1/0/M/+), borrowing
 * the FIRST surviving font for a newly-typed char gives the wrong
 * answer: typing M with font('1')'s handle produces tofu because the
 * '1' subset doesn't have an M glyph at all.
 *
 * This function returns a map: Unicode → font handle, derived from
 * which font each surviving sub-run actually uses. For "10M+" the map
 * is `{'1': font_for_1, '0': font_for_0, 'M': font_for_M, '+': font_for_plus}`.
 * The caller can then look up each inserted char in this map and
 * borrow the CORRECT font for that char, falling back to Helvetica
 * only for chars no surviving sub-run contains.
 */
export function _buildPerCharFontMap(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  plan: PartialEditPlan,
): Map<string, number> {
  const map = new Map<string, number>();
  const fontMod = m as unknown as FontReadingModule;
  if (!fontMod.FPDFTextObj_GetFont) return map;
  const removed = new Set(plan.removePtrs.map((r) => r.ptr));
  for (let i = 0; i < plan.prevMergedFromPtrs.length; i++) {
    const ptr = plan.prevMergedFromPtrs[i];
    if (!ptr || removed.has(ptr)) continue;
    const text = plan.prevMergedFromTexts[i];
    if (!text) continue;
    let fontPtr: number;
    try {
      fontPtr = fontMod.FPDFTextObj_GetFont(ptr);
    } catch {
      continue;
    }
    if (!fontPtr) continue;
    // Each text object generally renders one char in subset fonts,
    // but for multi-char objects, attribute the font to every char
    // (best-effort: the same font CAN render every char of THAT
    // particular text object's content stream).
    for (const ch of text) {
      if (!map.has(ch)) map.set(ch, fontPtr);
    }
  }
  return map;
}

interface FormRemovalModule {
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

export interface PartialEditApplyResult {
  newMergedFromPtrs: number[];
  newMergedFromTexts: string[];
  newMergedFromBounds: Array<{ x: number; right: number }>;
  /**
   * Per-sub-run char-start positions in the NEW run.text (post-edit).
   * Walking sub-runs in order, each entry is the running sum of
   * preceding sub-run text lengths, leaving no gaps - inserted text
   * is contiguous with the kept text around it. Stored on the run so
   * the next edit's partialEdit can map char positions to sub-runs
   * without ambiguity.
   */
  newMergedFromCharStarts: number[];
  insertedPtrs: number[];
  newBoundsX: number;
  newBoundsWidth: number;
}

export function applyPartialEditPlan(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  plan: PartialEditPlan,
): PartialEditApplyResult {
  const m = doc.module;
  const formMod = m as unknown as FormRemovalModule;
  // Step 1: remove deleted sub-objects.
  for (const { ptr, containerPtr } of plan.removePtrs) {
    if (!ptr) continue;
    if (containerPtr && formMod.FPDFFormObj_RemoveObject) {
      try {
        formMod.FPDFFormObj_RemoveObject(containerPtr, ptr);
      } catch {
        /* best-effort */
      }
    } else {
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
  }

  // Step 2: walk ops. Track only the cumulative `offset` from inserts
  // and deletes - kept sub-runs are shifted by that offset, so the
  // ORIGINAL inter-object spacing (including standalone zero-width
  // "space" sub-objects that exist between word glyphs in many PDFs)
  // is preserved between consecutive kept sub-runs.
  //
  // The earlier approach computed a monotonically-increasing cursor
  // from each kept sub-run's width, which collapsed any inter-object
  // gap that wasn't captured in a sub-run's bounding box. Result: an
  // edit that only deletes one char also stripped every inter-word
  // space from the saved PDF - because the spaces lived in the gaps
  // between sub-objects, not inside them.
  const fallbackFamily = helveticaVariantFor(run.fontId);
  const newMergedFromPtrs: number[] = [];
  const newMergedFromTexts: string[] = [];
  const newMergedFromBounds: Array<{ x: number; right: number }> = [];
  const newMergedFromCharStarts: number[] = [];
  const insertedPtrs: number[] = [];

  // Font-borrow strategy for inserted text:
  //
  // Embedded CID fonts have no reliable Unicode→CID reverse lookup
  // (ToUnicode CMaps are one-way by design). So `FPDFText_SetText`
  // with arbitrary Unicode chars often renders as 0-width / tofu in
  // the source font - even for chars demonstrably present elsewhere
  // in the line. The cleanest fix would be `FPDFText_SetCharcodes`
  // with the original byte codes, but that needs binding work to
  // expose per-char-code accessors on text objects.
  //
  // Workaround we DO ship: try the borrow, measure the actual
  // rendered width via `FPDFPageObj_GetBounds`, and fall back to
  // Helvetica when the result looks broken (sub-threshold per-char
  // width = font didn't have working glyphs for these chars). The
  // detection costs one bounds read per emit - negligible.
  //
  // Borrow-font policy: always borrow when a charcode strategy is
  // active (cmap / content-stream / backend can resolve any char the
  // font has a glyph for), else use the conservative
  // surviving-chars-pool check.
  //
  // The legacy 'helvetica' strategy still needs the safety gate
  // because FPDFText_SetText can map unknown chars to glyph 0xFF
  // (ydieresis) which renders at full visible width and passes the
  // measure check below - the safety gate keeps that failure mode
  // out of the saved PDF.
  //
  // Active strategies don't have that problem: charcodes that
  // resolve produce the right glyph, and chars that DON'T resolve
  // are detected by tryResolveCharcodes returning `missing.length >
  // 0`, in which case emitTextLine falls back to SetText for that
  // chunk (and the existing measure-and-fallback below catches any
  // resulting tofu).
  const strategy =
    typeof window === "undefined"
      ? "helvetica"
      : (() => {
          try {
            const fromUrl = new URL(window.location.href).searchParams.get(
              "charcodeStrategy",
            );
            if (
              fromUrl === "cmap" ||
              fromUrl === "content-stream" ||
              fromUrl === "backend"
            )
              return fromUrl;
            const fromLs = window.localStorage?.getItem("v2.charcodeStrategy");
            if (
              fromLs === "cmap" ||
              fromLs === "content-stream" ||
              fromLs === "backend"
            )
              return fromLs;
          } catch {
            /* fall through to default */
          }
          return "helvetica";
        })();

  const survivingChars = new Set<string>();
  for (let i = 0; i < plan.prevMergedFromTexts.length; i++) {
    if (plan.subRunStatus[i] !== "all-deleted") {
      for (const ch of plan.prevMergedFromTexts[i]) survivingChars.add(ch);
    }
  }
  for (const otherPage of doc.loadedPages()) {
    for (const otherRun of otherPage.runs) {
      if (otherRun.fontId !== run.fontId) continue;
      for (const ch of otherRun.text) survivingChars.add(ch);
      for (const sub of otherRun.mergedFromTexts) {
        for (const ch of sub) survivingChars.add(ch);
      }
    }
  }
  let allInsertCharsAreSafe = true;
  for (const op of plan.ops) {
    if (op.type === "insert" && op.text) {
      for (const ch of op.text) {
        if (!survivingChars.has(ch)) {
          allInsertCharsAreSafe = false;
          break;
        }
      }
    }
    if (!allInsertCharsAreSafe) break;
  }
  const useStrategyBorrow = strategy !== "helvetica";
  const borrowedFontPtr =
    useStrategyBorrow || allInsertCharsAreSafe
      ? borrowFontFromSurvivor(m, plan)
      : 0;

  // Strategy: walk ops in order. Track a cumulative `offset` that gets
  // added to subsequent kept sub-runs' positions, accounting for the
  // WIDTH DELTA between each mixed sub-run's original glyphs and its
  // Helvetica replacement (typically narrower → negative delta → keep
  // sub-runs after the edit shift LEFT to close the gap).
  //
  // For a "delete one letter from middle of word" edit:
  //   * keep ops before the mixed word: stay at original position
  //   * insert op for the word's kept chars: emits at the original
  //     word's left edge (anchor) so leading whitespace is preserved
  //   * width delta accumulates: e.g. Helvetica "Modle " is ~13pt
  //     narrower than original LMRoman "Moodle ", so offset = -13pt
  //   * keep ops AFTER the mixed word: shift left by 13pt, closing
  //     the gap that would otherwise appear
  let firstX = run.bounds.x;
  let lastEnd = run.bounds.x;
  let offset = 0;
  // Tracks the highest sub-run index we've already accounted for in
  // `offset`. Before processing each keep/anchor op, we walk forward
  // and subtract the widths of any all-deleted sub-runs strictly
  // between the previous processed index and this op's sub-run index.
  // This closes the visible gap that would otherwise sit where the
  // deleted sub-run used to live.
  let processedUpTo = -1;
  function absorbDeletesBefore(idx: number): void {
    for (let i = processedUpTo + 1; i < idx; i++) {
      if (plan.subRunStatus[i] === "all-deleted") {
        const b = plan.prevMergedFromBounds[i];
        if (b) offset -= b.right - b.x;
      }
    }
    processedUpTo = Math.max(processedUpTo, idx);
  }

  for (const op of plan.ops) {
    if (op.type === "keep" && op.subRunIdx !== undefined) {
      absorbDeletesBefore(op.subRunIdx);
      const ptr = plan.prevMergedFromPtrs[op.subRunIdx];
      const text = plan.prevMergedFromTexts[op.subRunIdx];
      const origBounds = plan.prevMergedFromBounds[op.subRunIdx];
      if (Math.abs(offset) > 0.05) {
        try {
          m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, offset, 0);
        } catch {
          /* best-effort */
        }
      }
      const newX = origBounds.x + offset;
      const newRight = origBounds.right + offset;
      newMergedFromPtrs.push(ptr);
      newMergedFromTexts.push(text);
      newMergedFromBounds.push({ x: newX, right: newRight });
      newMergedFromCharStarts.push(op.startBIdx);
      if (newRight > lastEnd) lastEnd = newRight;
    } else if (op.type === "insert" && op.text) {
      const insertText = op.text;
      const anchorIdx = op.anchorSubRunIdx;
      if (anchorIdx !== undefined) absorbDeletesBefore(anchorIdx);
      const origBounds =
        anchorIdx !== undefined ? plan.prevMergedFromBounds[anchorIdx] : null;
      // Anchored inserts (replacing a mixed sub-run) emit at the
      // original sub-run's x PLUS any offset already accumulated from
      // earlier replacements. Unanchored inserts (typed-at-end) emit
      // at lastEnd.
      const anchorX = origBounds ? origBounds.x + offset : lastEnd;

      // Try borrowed source font first when every insert char is
      // safe; measure the result and fall back to Helvetica if the
      // rendered width is sub-threshold (font didn't have working
      // glyphs at the chars we passed via SetText).
      let ptrs = emitTextLine({
        doc,
        page,
        text: insertText,
        x: anchorX,
        y: run.matrix.f,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr: borrowedFontPtr,
        fallbackFamily,
      });
      let realRightEdge = anchorX;
      for (const ptr of ptrs) {
        const r = measureObjRightEdgePt(m, ptr);
        if (r > realRightEdge) realRightEdge = r;
      }
      let measuredWidth = realRightEdge - anchorX;

      // Heuristic: a working visible glyph is at least ~0.15 * fontSize
      // wide. Anything below that PER NON-WHITESPACE CHAR means SetText
      // returned a 0-width (.notdef) glyph - the borrowed font's
      // Unicode→CID lookup failed. Re-emit via Helvetica fallback.
      //
      // We exclude whitespace from the check because FPDFPageObj_GetBounds
      // returns the visible-glyph extent (0 for spaces, regardless of
      // the font's advance width). A pure-whitespace insert (e.g.
      // typing a single space) ALWAYS measures 0 and would be wrongly
      // re-emitted forever.
      const nonWhitespaceLen = insertText.replace(/\s/g, "").length;
      const minExpected = nonWhitespaceLen * run.fontSize * 0.15;
      if (
        borrowedFontPtr !== 0 &&
        nonWhitespaceLen > 0 &&
        measuredWidth < minExpected
      ) {
        // Remove the failed text objects before retrying.
        for (const ptr of ptrs) {
          if (!ptr) continue;
          try {
            m.FPDFPage_RemoveObject(page.pagePtr, ptr);
          } catch {
            /* best-effort */
          }
        }
        ptrs = emitTextLine({
          doc,
          page,
          text: insertText,
          x: anchorX,
          y: run.matrix.f,
          fontSize: run.fontSize,
          fill: run.fill,
          originalFontPtr: 0,
          fallbackFamily,
        });
        realRightEdge = anchorX;
        for (const ptr of ptrs) {
          const r = measureObjRightEdgePt(m, ptr);
          if (r > realRightEdge) realRightEdge = r;
        }
        measuredWidth = realRightEdge - anchorX;
      }

      // FPDFPageObj_GetBounds doesn't include the advance width of
      // characters without a visible glyph (spaces, tabs). Without
      // patching the measurement we'd push subsequent kept sub-runs
      // RIGHT by 0 for "AlternativeHi"-style inserts that should
      // contain a space - the bitmap renders "AlternativeHi" with no
      // gap. Add a canvas-measured estimate for any whitespace chars
      // in the insert so the offset accumulates correctly.
      const whitespaceLen = insertText.length - nonWhitespaceLen;
      if (whitespaceLen > 0) {
        const whitespaceText = " ".repeat(whitespaceLen);
        const wsWidth = measureWhitespaceAdvancePt(
          whitespaceText,
          fallbackFamily,
          run.fontSize,
        );
        measuredWidth += wsWidth;
      }
      // Distribute the measured width across the emit ptrs for the
      // per-chunk model bounds (used by future edits).
      let runningCursor = anchorX;
      // Distribute char-start across the ptrs sequentially.
      let runningCharOffset = 0;
      const insertCharLen = insertText.length / Math.max(1, ptrs.length);
      for (let i = 0; i < ptrs.length; i++) {
        const sliceWidth = measuredWidth / ptrs.length;
        newMergedFromPtrs.push(ptrs[i]);
        newMergedFromTexts.push(insertText);
        newMergedFromBounds.push({
          x: runningCursor,
          right: runningCursor + sliceWidth,
        });
        newMergedFromCharStarts.push(
          op.startBIdx + Math.round(runningCharOffset),
        );
        runningCursor += sliceWidth;
        runningCharOffset += insertCharLen;
      }
      insertedPtrs.push(...ptrs);
      if (runningCursor > lastEnd) lastEnd = runningCursor;
      // Update offset:
      //   * anchored (mixed-replacement): delta vs original sub-run
      //     width. Negative delta shifts subsequent keeps LEFT (close
      //     the gap when Helvetica is narrower than original glyphs).
      //   * unanchored (pure user-typed insert in the middle of a
      //     line, e.g. "Acrob|at" → "Acrobaaaat" with caret between
      //     "b" and "a"): the inserted text occupies new space, so
      //     subsequent keeps need to shift RIGHT by the full inserted
      //     width. Without this every following sub-run rendered on
      //     top of the new chars and the bitmap looked like the
      //     insert never happened.
      if (origBounds) {
        const origWidth = origBounds.right - origBounds.x;
        offset += measuredWidth - origWidth;
      } else {
        offset += measuredWidth;
      }
    }
  }

  m.FPDFPage_GenerateContent(page.pagePtr);

  if (newMergedFromBounds.length > 0) {
    firstX = newMergedFromBounds[0].x;
  }

  // newMergedFromCharStarts is populated inline by the ops walk
  // above. Each entry comes from op.startBIdx (the bIdx in nextText
  // where the op's first char lives) - preserving any LineGrouper-
  // synthesised whitespace gaps because those bIdx values reflect
  // the actual nextText layout.

  return {
    newMergedFromPtrs,
    newMergedFromTexts,
    newMergedFromBounds,
    newMergedFromCharStarts,
    insertedPtrs,
    newBoundsX: firstX,
    newBoundsWidth: lastEnd - firstX,
  };
}
