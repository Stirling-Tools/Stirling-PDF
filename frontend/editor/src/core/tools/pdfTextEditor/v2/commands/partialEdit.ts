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

function lcsIndices(a: string, b: string): {
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
      else dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
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

  // Map each prev char index to its sub-run index.
  const charToSubRun = new Array<number>(prevText.length).fill(-1);
  let charCursor = 0;
  for (let i = 0; i < run.mergedFromPtrs.length; i++) {
    const subText = run.mergedFromTexts[i];
    for (let c = 0; c < subText.length && charCursor + c < prevText.length; c++) {
      charToSubRun[charCursor + c] = i;
    }
    charCursor += subText.length;
  }
  if (charCursor !== prevText.length) return null; // sub-run texts don't add up

  // Classify sub-runs. all-kept = preserve as-is, all-deleted = remove,
  // mixed = sub-run has some kept and some deleted chars. We can't
  // PDFium-split a text object, so for mixed we remove the whole thing
  // and treat the kept chars as if they were inserts (Helvetica fallback).
  // Far better than re-emitting the WHOLE line as Helvetica.
  const subRunStatus: Array<"all-kept" | "all-deleted" | "mixed"> = [];
  const mixedSubRuns = new Set<number>();
  for (let i = 0; i < run.mergedFromPtrs.length; i++) {
    const subText = run.mergedFromTexts[i];
    const start = subRunStartOf(run, i);
    let keptCount = 0;
    for (let c = start; c < start + subText.length; c++) {
      if (keptA.has(c)) keptCount += 1;
    }
    if (keptCount === 0) subRunStatus.push("all-deleted");
    else if (keptCount === subText.length) subRunStatus.push("all-kept");
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

function subRunStartOf(run: TextRun, subRunIdx: number): number {
  let start = 0;
  for (let i = 0; i < subRunIdx; i++) start += run.mergedFromTexts[i].length;
  return start;
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

  // Step 2: walk ops, position each kept sub-run (by shifting its text
  // matrix) and emit Helvetica chunks for inserted text. Track cursor.
  const fallbackFamily = helveticaVariantFor(run.fontId);
  const newMergedFromPtrs: number[] = [];
  const newMergedFromTexts: string[] = [];
  const newMergedFromBounds: Array<{ x: number; right: number }> = [];
  const insertedPtrs: number[] = [];

  let cursor = run.bounds.x; // anchor at the original left edge
  let firstX = cursor;

  for (const op of plan.ops) {
    if (op.type === "keep" && op.subRunIdx !== undefined) {
      const ptr = plan.prevMergedFromPtrs[op.subRunIdx];
      const text = plan.prevMergedFromTexts[op.subRunIdx];
      const origBounds = plan.prevMergedFromBounds[op.subRunIdx];
      const width = origBounds.right - origBounds.x;
      const dx = cursor - origBounds.x;
      if (Math.abs(dx) > 0.05) {
        try {
          m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, dx, 0);
        } catch {
          /* best-effort */
        }
      }
      newMergedFromPtrs.push(ptr);
      newMergedFromTexts.push(text);
      newMergedFromBounds.push({ x: cursor, right: cursor + width });
      cursor += width;
    } else if (op.type === "insert" && op.text) {
      const insertText = op.text;
      const ptrs = emitTextLine({
        doc,
        page,
        text: insertText,
        x: cursor,
        y: run.matrix.f,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr: 0,
        fallbackFamily,
      });
      const measuredWidth = measureAdvancePt(insertText, run.fontSize);
      let runningCursor = cursor;
      for (let i = 0; i < ptrs.length; i++) {
        // For accurate per-chunk widths we'd need to read each ptr's
        // bounds back; rough estimate is fine for the model arrays
        // since they're only used for layout calculations by future
        // edits (which read fresh bounds from PDFium anyway).
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
      cursor += measuredWidth;
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
    newBoundsWidth: cursor - firstX,
  };
}
