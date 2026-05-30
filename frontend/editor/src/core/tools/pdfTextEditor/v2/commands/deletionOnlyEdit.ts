import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";

/**
 * "Pure deletion" fast path for editing per-character text runs (the
 * common case for InDesign-style PDFs that emit one text object per
 * glyph).
 *
 * When the new text is a subsequence of the previous text - i.e. the
 * user only removed chars, didn't add or change any - we can:
 *  1. Map each surviving char back to a source sub-object via
 *     `mergedFromTexts` (parallel to `mergedFromPtrs`).
 *  2. Remove the sub-objects whose chars were all deleted.
 *  3. Shift the surviving "later" sub-objects left to close the gap
 *     by translating their text-object matrix.
 *
 * This keeps the original font, glyphs, and exact char codes intact -
 * the only path that survives custom-encoded embedded fonts without
 * the SetText-encoding round-trip losing glyphs.
 *
 * Returns `null` when the edit isn't a pure subsequence deletion or
 * the run doesn't have the per-sub-run metadata we need.
 */
export interface DeletionPlan {
  /** Sub-object pointers to remove (with their parent container ptrs). */
  removePtrs: Array<{ ptr: number; containerPtr: number }>;
  /** Translations to apply to surviving sub-objects, in PDF points. */
  translates: Array<{ ptr: number; dx: number }>;
  /** Updated mergedFromPtrs / mergedFromTexts / mergedFromBounds for the rep. */
  newMergedFromPtrs: number[];
  newMergedFromTexts: string[];
  newMergedFromBounds: Array<{ x: number; right: number }>;
  /** New text width (right edge of last kept sub-obj minus left edge of first). */
  newBoundsWidth: number;
}

export function planDeletionEdit(
  run: TextRun,
  prevText: string,
  nextText: string,
): DeletionPlan | null {
  if (run.mergedFromPtrs.length === 0) return null;
  if (run.mergedFromTexts.length !== run.mergedFromPtrs.length) return null;
  if (run.mergedFromBounds.length !== run.mergedFromPtrs.length) return null;
  if (nextText.length >= prevText.length) return null; // not a pure deletion
  if (nextText.length === 0) return null;

  // Rightmost greedy subsequence match: assign each next char to the
  // latest possible prev char. Picking from the right keeps later runs
  // of contiguous chars together (vs greedy-left which fragments).
  const keepPrev = new Array<boolean>(prevText.length).fill(false);
  let pi = prevText.length - 1;
  for (let ni = nextText.length - 1; ni >= 0; ni--) {
    while (pi >= 0 && prevText[pi] !== nextText[ni]) pi--;
    if (pi < 0) return null;
    keepPrev[pi] = true;
    pi--;
  }

  // Walk the merged sub-runs and tag each as fully-kept, fully-removed,
  // or mixed. Mixed = some chars kept, some deleted - we bail out to
  // the fallback path because we can't partially edit a sub-object
  // without going through SetText (which breaks custom fonts).
  const removePtrs: Array<{ ptr: number; containerPtr: number }> = [];
  const keptIndices: number[] = [];
  let charCursor = 0;
  for (let i = 0; i < run.mergedFromPtrs.length; i++) {
    const subText = run.mergedFromTexts[i];
    const start = charCursor;
    const end = start + subText.length;
    let keptCount = 0;
    for (let c = start; c < end && c < prevText.length; c++) {
      if (keepPrev[c]) keptCount += 1;
    }
    if (keptCount === 0) {
      removePtrs.push({ ptr: run.mergedFromPtrs[i], containerPtr: run.containerPtr });
    } else if (keptCount === subText.length) {
      keptIndices.push(i);
    } else {
      // Mixed sub-run - bail out.
      return null;
    }
    charCursor = end;
  }

  if (keptIndices.length === 0) return null;
  if (removePtrs.length === 0) return null; // nothing to delete - no-op

  // Compute the shift for each surviving sub-run. Pre-gap survivors
  // stay put; for every kept sub-run after a removed one, accumulate
  // the removed sub-run's natural width into a running deficit and
  // shift the survivor left by exactly enough to land flush with the
  // previous kept survivor's right edge.
  const translates: Array<{ ptr: number; dx: number }> = [];
  const newMergedFromPtrs: number[] = [];
  const newMergedFromTexts: string[] = [];
  const newMergedFromBounds: Array<{ x: number; right: number }> = [];
  let cumulativeShift = 0;
  let prevKeptNewRight: number | null = null;
  let firstKeptIdx = keptIndices[0];
  for (let i = 0; i < run.mergedFromPtrs.length; i++) {
    if (!keptIndices.includes(i)) continue;
    const bounds = run.mergedFromBounds[i];
    let dx = 0;
    if (prevKeptNewRight !== null) {
      // Desired new x for this sub-run = right edge of previous kept
      // sub-run + the ORIGINAL inter-sub-run gap (so we keep natural
      // spacing of contiguous groups).
      // We only close the gap when there were removed sub-runs between
      // the previous kept and this one.
      const prevKeptOrigRight =
        run.mergedFromBounds[
          findPrevKeptIdx(keptIndices, i) ?? firstKeptIdx
        ].right;
      const originalGap = bounds.x - prevKeptOrigRight;
      const gapHadRemovals = i > 0 && removalsBetween(run, keptIndices, i);
      const desiredX = gapHadRemovals
        ? prevKeptNewRight + Math.max(0, Math.min(originalGap, 0))
        : prevKeptNewRight + originalGap;
      const newX = bounds.x - cumulativeShift;
      const extraShift = newX - desiredX;
      if (extraShift > 0) cumulativeShift += extraShift;
      dx = -cumulativeShift;
    }
    if (dx !== 0) {
      translates.push({ ptr: run.mergedFromPtrs[i], dx });
    }
    const newRight = bounds.right + dx;
    newMergedFromPtrs.push(run.mergedFromPtrs[i]);
    newMergedFromTexts.push(run.mergedFromTexts[i]);
    newMergedFromBounds.push({ x: bounds.x + dx, right: newRight });
    prevKeptNewRight = newRight;
  }

  const firstKept = newMergedFromBounds[0];
  const lastKept = newMergedFromBounds[newMergedFromBounds.length - 1];
  const newBoundsWidth = lastKept.right - firstKept.x;

  return {
    removePtrs,
    translates,
    newMergedFromPtrs,
    newMergedFromTexts,
    newMergedFromBounds,
    newBoundsWidth,
  };
}

function findPrevKeptIdx(keptIndices: number[], thisIdx: number): number | null {
  let prev: number | null = null;
  for (const k of keptIndices) {
    if (k === thisIdx) return prev;
    prev = k;
  }
  return prev;
}

function removalsBetween(
  run: TextRun,
  keptIndices: number[],
  thisKeptIdx: number,
): boolean {
  const prevKept = findPrevKeptIdx(keptIndices, thisKeptIdx);
  if (prevKept === null) return false;
  return thisKeptIdx - prevKept > 1;
}

interface FormRemovalModule {
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

/** Apply a deletion plan: remove sub-objects, translate survivors. */
export function applyDeletionPlan(
  doc: EditorDocument,
  page: Page,
  plan: DeletionPlan,
): void {
  const m = doc.module;
  const formMod = m as unknown as FormRemovalModule;
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
  for (const { ptr, dx } of plan.translates) {
    if (!ptr || dx === 0) continue;
    try {
      m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, dx, 0);
    } catch {
      /* best-effort */
    }
  }
  m.FPDFPage_GenerateContent(page.pagePtr);
}
