import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { emitTextLine } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
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
}

export interface PartialEditPlan {
  removePtrs: Array<{ ptr: number; containerPtr: number }>;
  ops: PartialEditOp[];
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

  // Map each prev char index to its sub-run index by LOCATING each
  // sub-run's text inside prevText. LineGrouper may have synthesised
  // whitespace between sub-runs (positional cursor jumps that don't
  // exist as actual chars in any sub-run); those chars stay at -1
  // (ghost) and are skipped by the ops walk - keeping the surrounding
  // sub-runs preserves the gap as a positional offset.
  //
  // Earlier versions of this function reconstructed the gaps via a
  // heuristic that matched LineGrouper's, but any drift (different
  // fontSize source, rounding) silently misclassified sub-runs and
  // corrupted text. Locating sub-run texts directly removes the
  // heuristic entirely.
  const charToSubRun = new Array<number>(prevText.length).fill(-1);
  const subRunRanges: Array<{ start: number; end: number } | null> = [];
  let scanPos = 0;
  for (let i = 0; i < run.mergedFromTexts.length; i++) {
    const subText = run.mergedFromTexts[i];
    if (subText.length === 0) {
      subRunRanges.push({ start: scanPos, end: scanPos });
      continue;
    }
    const found = prevText.indexOf(subText, scanPos);
    if (found < 0) return null; // sub-run text vanished from prevText — bail
    for (let c = found; c < found + subText.length; c++) {
      charToSubRun[c] = i;
    }
    subRunRanges.push({ start: found, end: found + subText.length });
    scanPos = found + subText.length;
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
  const ops: PartialEditOp[] = [];
  let lastSubRun = -1;
  let insertBuf = "";
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
        insertBuf += nextText[b];
        continue;
      }
      if (insertBuf.length > 0) {
        ops.push({ type: "insert", text: insertBuf });
        insertBuf = "";
      }
      if (subRunIdx !== lastSubRun) {
        ops.push({ type: "keep", subRunIdx });
        lastSubRun = subRunIdx;
      }
    } else {
      insertBuf += nextText[b];
    }
  }
  if (insertBuf.length > 0) {
    ops.push({ type: "insert", text: insertBuf });
  }

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
    prevMergedFromPtrs: [...run.mergedFromPtrs],
    prevMergedFromTexts: [...run.mergedFromTexts],
    prevMergedFromBounds: run.mergedFromBounds.map((b) => ({ ...b })),
  };
}

interface FormRemovalModule {
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

let measureCanvas: HTMLCanvasElement | null = null;
function measureAdvancePt(text: string, fontSizePt: number): number {
  if (typeof document === "undefined") return text.length * fontSizePt * 0.5;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * fontSizePt * 0.5;
  ctx.font = `${fontSizePt}pt "Liberation Sans", Helvetica, Arial, sans-serif`;
  return ctx.measureText(text).width;
}

export interface PartialEditApplyResult {
  newMergedFromPtrs: number[];
  newMergedFromTexts: string[];
  newMergedFromBounds: Array<{ x: number; right: number }>;
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
  const insertedPtrs: number[] = [];

  // Strategy: kept sub-runs ALWAYS stay at their original position.
  // Inserts fill into the empty slot left by an adjacent deleted /
  // mixed sub-run. We never shift a kept sub-run sideways - the layout
  // intent (inter-word positional gaps from the source PDF, glyph
  // alignment, etc.) is preserved that way. If a Helvetica replacement
  // for a mixed sub-run is slightly wider or narrower than the original
  // glyph stretch, the visual result is a small gap or tight overlap at
  // exactly the edited word's position - bounded and predictable.
  let firstX = run.bounds.x;
  let lastEnd = run.bounds.x;

  for (const op of plan.ops) {
    if (op.type === "keep" && op.subRunIdx !== undefined) {
      const ptr = plan.prevMergedFromPtrs[op.subRunIdx];
      const text = plan.prevMergedFromTexts[op.subRunIdx];
      const origBounds = plan.prevMergedFromBounds[op.subRunIdx];
      newMergedFromPtrs.push(ptr);
      newMergedFromTexts.push(text);
      newMergedFromBounds.push({ x: origBounds.x, right: origBounds.right });
      if (origBounds.right > lastEnd) lastEnd = origBounds.right;
    } else if (op.type === "insert" && op.text) {
      const insertText = op.text;
      const ptrs = emitTextLine({
        doc,
        page,
        text: insertText,
        x: lastEnd,
        y: run.matrix.f,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr: 0,
        fallbackFamily,
      });
      const measuredWidth = measureAdvancePt(insertText, run.fontSize);
      let runningCursor = lastEnd;
      for (let i = 0; i < ptrs.length; i++) {
        const sliceWidth = measuredWidth / ptrs.length;
        newMergedFromPtrs.push(ptrs[i]);
        newMergedFromTexts.push(insertText);
        newMergedFromBounds.push({
          x: runningCursor,
          right: runningCursor + sliceWidth,
        });
        runningCursor += sliceWidth;
      }
      insertedPtrs.push(...ptrs);
      lastEnd += measuredWidth;
    }
  }

  m.FPDFPage_GenerateContent(page.pagePtr);

  if (newMergedFromBounds.length > 0) {
    firstX = newMergedFromBounds[0].x;
  }

  return {
    newMergedFromPtrs,
    newMergedFromTexts,
    newMergedFromBounds,
    insertedPtrs,
    newBoundsX: firstX,
    newBoundsWidth: lastEnd - firstX,
  };
}
