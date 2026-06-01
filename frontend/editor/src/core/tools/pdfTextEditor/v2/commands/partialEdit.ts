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

  // Note: a previous attempt borrowed the source font handle for
  // inserted text so the new chars would render in the surrounding
  // line's typeface. It works for some fonts but PDFium's
  // FPDFText_SetText on a borrowed handle to a non-standard
  // embedded font returns 0-width / garbage glyphs for chars not
  // present at the SAME slot in the source - which kills width
  // measurements and breaks subsequent-keep positioning. Leaving
  // the borrow disabled until we can detect "this font safely
  // re-encodes arbitrary Unicode" without false positives. Inserted
  // text therefore always uses base-14 Helvetica (the fallback
  // family). Tracked as: inserted glyph font matching for embedded
  // CID fonts.

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
      const ptrs = emitTextLine({
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
      // Use PDFium's actual rendered right edge (read back via
      // FPDFPageObj_GetBounds) rather than canvas-measured Helvetica
      // width. Canvas falls back to Liberation Sans which is wider
      // than PDFium's base-14 Helvetica by 15-20%, so canvas-based
      // offsets push subsequent keeps too far right.
      let realRightEdge = anchorX;
      for (const ptr of ptrs) {
        const r = measureObjRightEdgePt(m, ptr);
        if (r > realRightEdge) realRightEdge = r;
      }
      const measuredWidth = realRightEdge - anchorX;
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
