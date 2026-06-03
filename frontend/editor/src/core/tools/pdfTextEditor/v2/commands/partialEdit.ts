import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";
import {
  emitTextLine,
  measureObjRightEdgePt,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";
import { writeUtf16 } from "@app/services/pdfiumService";

/**
 * Set the text of an EXISTING PDFium text object, preserving its font.
 * Used to edit a "mixed" sub-run in place (e.g. trim a trailing space
 * off "n ") so the embedded glyph is kept instead of re-emitted in a
 * fallback font.
 */
export function setObjText(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptr: number,
  text: string,
): void {
  if (!ptr) return;
  const buf = writeUtf16(m, text);
  try {
    m.FPDFText_SetText(ptr, buf);
  } catch {
    /* best-effort */
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

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
  type: "keep" | "insert" | "modify";
  /** keep / modify: sub-run index in run.mergedFromPtrs */
  subRunIdx?: number;
  /** insert: text to emit in fallback font. modify: surviving chars to
   * SetText onto the existing object (keeps its embedded font). */
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
   * insert only: the FOLLOWING kept sub-run this insert is a prefix of.
   * Set when the user typed chars directly in front of a word (preceded
   * by whitespace / line-start, with no space between the insert and the
   * word) - e.g. "AA" before "Acrobat". The emit then anchors at that
   * sub-run's ORIGINAL left edge so the result reads "AAAcrobat" in
   * Acrobat's slot, and the following kept sub-runs shift right by the
   * full inserted width. Without this, the insert lands at the running
   * cursor (the previous word's right edge) and glues on as "AdobeAA".
   * Mutually exclusive with `anchorSubRunIdx`.
   */
  anchorBeforeSubRunIdx?: number;
  /**
   * insert only: how many whitespace chars in nextText sit between the
   * previous emitted glyph and this insert but belong to NO sub-run (ghost
   * spaces - e.g. a space the user just typed, which emits no object). The
   * apply step advances the insert's x by this many space-widths so the
   * new text isn't glued onto the preceding word ("more.ZEBRA"). Only used
   * for unanchored inserts (the anchored variants position off a sub-run's
   * own x, which already sits past the gap).
   */
  leadingGhostCount?: number;
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
  // For each mixed sub-run, the surviving chars (in original order). We
  // SetText these back onto the EXISTING object so its embedded font is
  // preserved - critical when a letter and a trailing space share one
  // source object ("n ") and the user deletes the space: re-emitting the
  // "n" in a borrowed/Helvetica font would drop the glyph for subset
  // fonts, so we edit the object in place instead.
  const mixedSurviving = new Map<number, string>();
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
    let surviving = "";
    for (let c = range.start; c < range.end; c++) {
      if (keptA.has(c)) {
        keptCount += 1;
        surviving += prevText[c];
      }
    }
    if (keptCount === 0) subRunStatus.push("all-deleted");
    else if (keptCount === subLen) subRunStatus.push("all-kept");
    else {
      subRunStatus.push("mixed");
      mixedSubRuns.add(i);
      mixedSurviving.set(i, surviving);
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
  // bIdx of the last char that produced (or rode on) a glyph - i.e. a kept
  // real char, a modified char, or an inserted char. Ghost whitespace does
  // NOT advance it, so the count of ghosts immediately before an insert is
  // `insertStartBIdx - lastEmittedBIdx - 1`.
  let lastEmittedBIdx = -1;
  // Ghost whitespace chars sitting right before the pending insert.
  let insertLeadingGhosts = 0;
  // Mixed sub-runs we've already emitted a single "modify" op for, so a
  // later surviving char from the same sub-run doesn't emit a second.
  const modifiedSubRuns = new Set<number>();
  function flushInsert(anchorBeforeSubRunIdx?: number): void {
    if (insertBuf.length === 0) return;
    ops.push({
      type: "insert",
      text: insertBuf,
      anchorSubRunIdx: insertAnchorSubRun,
      anchorBeforeSubRunIdx,
      leadingGhostCount: insertLeadingGhosts,
      startBIdx: insertStartBIdx,
    });
    insertBuf = "";
    insertAnchorSubRun = undefined;
    insertLeadingGhosts = 0;
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
      // Surviving chars of a mixed sub-run keep their ORIGINAL embedded
      // font: we SetText the surviving substring back onto the existing
      // object (one "modify" op per mixed sub-run) rather than removing
      // it and re-emitting in a fallback font. This is what stops a
      // letter from losing its font when its trailing space is deleted.
      if (mixedSubRuns.has(subRunIdx)) {
        flushInsert();
        if (!modifiedSubRuns.has(subRunIdx)) {
          ops.push({
            type: "modify",
            subRunIdx,
            text: mixedSurviving.get(subRunIdx) ?? "",
            startBIdx: b,
          });
          modifiedSubRuns.add(subRunIdx);
        }
        lastEmittedBIdx = b;
        continue;
      }
      // A pending pure-insert that ends in a non-whitespace char, sits at
      // the START of this NEW sub-run, and is itself preceded by
      // whitespace (or the line start) is a PREFIX the user typed onto
      // this following word - e.g. "AA" before "Acrobat". Anchor it at
      // this sub-run's original left edge so it renders "AAAcrobat" in
      // Acrobat's slot rather than glued to the previous word ("AdobeAA").
      // A non-whitespace char before the insert (a mid-word insert) leaves
      // it anchored at the running cursor (grow-right), unchanged.
      let anchorBeforeIdx: number | undefined;
      if (
        insertBuf.length > 0 &&
        insertAnchorSubRun === undefined &&
        subRunIdx !== lastSubRun &&
        !/\s$/.test(insertBuf) &&
        (insertStartBIdx === 0 || /\s/.test(nextText[insertStartBIdx - 1]))
      ) {
        anchorBeforeIdx = subRunIdx;
      }
      flushInsert(anchorBeforeIdx);
      if (subRunIdx !== lastSubRun) {
        ops.push({ type: "keep", subRunIdx, startBIdx: b });
        lastSubRun = subRunIdx;
      }
      lastEmittedBIdx = b;
    } else {
      if (insertBuf.length === 0) {
        insertStartBIdx = b;
        // Whitespace chars skipped since the last real glyph are ghost
        // spaces this insert must sit AFTER (not on top of).
        insertLeadingGhosts = Math.max(0, b - lastEmittedBIdx - 1);
      }
      insertBuf += nextText[b];
      lastEmittedBIdx = b;
    }
  }
  flushInsert();

  // Collect removals: only ALL-deleted sub-runs. Mixed sub-runs are
  // edited in place via "modify" ops (keeping their object + font), so
  // they must NOT be removed.
  const removePtrs: Array<{ ptr: number; containerPtr: number }> = [];
  for (let i = 0; i < run.mergedFromPtrs.length; i++) {
    if (subRunStatus[i] === "all-deleted") {
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
 * Borrow the font of a surviving sub-object that ACTUALLY CONTAINS the
 * characters we're about to insert - so the new glyph reuses the exact
 * embedded font that already renders that char ("use the glyph of the
 * i next to it"). Many PDFs embed one subset font per glyph-group, so
 * the first survivor ("W") may be a subset that lacks "i"; borrowing it
 * forces PDFium to guess a substitute (or fall back to Helvetica).
 * Preferring a survivor that holds the inserted char makes the reuse
 * deterministic. Falls back to the first survivor, then 0.
 */
function borrowFontForChars(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  plan: PartialEditPlan,
  chars: string,
): number {
  const fontMod = m as unknown as FontReadingModule;
  if (!fontMod.FPDFTextObj_GetFont) return 0;
  const removed = new Set(plan.removePtrs.map((r) => r.ptr));
  const want = new Set([...chars].filter((c) => c.trim().length > 0));
  if (want.size > 0) {
    // Prefer a survivor whose text shares the most chars with the insert
    // (so multi-char inserts pick a font covering as much as possible).
    let bestPtr = 0;
    let bestScore = 0;
    for (let i = 0; i < plan.prevMergedFromPtrs.length; i++) {
      const ptr = plan.prevMergedFromPtrs[i];
      if (!ptr || removed.has(ptr)) continue;
      const text = plan.prevMergedFromTexts[i] ?? "";
      let score = 0;
      for (const c of text) if (want.has(c)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestPtr = ptr;
      }
    }
    if (bestPtr) {
      try {
        const fontPtr = fontMod.FPDFTextObj_GetFont(bestPtr);
        if (fontPtr) return fontPtr;
      } catch {
        /* fall through */
      }
    }
  }
  return borrowFontFromSurvivor(m, plan);
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
  /**
   * Override the baseline used for emitted inserts. When the caller is
   * the paragraph-partial path, this is the slot's `matrixF`, not the
   * paragraph rep's overall `matrix.f`. Defaults to `run.matrix.f`.
   */
  baselineY?: number,
  /**
   * Override the left edge used for the FIRST unanchored insert (before
   * any keep op has set the cursor). Paragraph slots pass the slot's
   * own left x so an inserted-at-line-start edit anchors at the line,
   * not at the paragraph's overall bounds. Defaults to `run.bounds.x`.
   */
  defaultX?: number,
): PartialEditApplyResult {
  const m = doc.module;
  const formMod = m as unknown as FormRemovalModule;
  const emitY = baselineY ?? run.matrix.f;
  const startX = defaultX ?? run.bounds.x;
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
  // Only attempt the borrow when EVERY char in EVERY insert op
  // already appears in some surviving sub-run's text. The surviving
  // glyphs are proof the font has a working CID for those chars; an
  // arbitrary new char (e.g. user typed 'Ω' into an ASCII document)
  // skips the borrow and goes straight to Helvetica.
  const survivingChars = new Set<string>();
  for (let i = 0; i < plan.prevMergedFromTexts.length; i++) {
    if (plan.subRunStatus[i] !== "all-deleted") {
      for (const ch of plan.prevMergedFromTexts[i]) survivingChars.add(ch);
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
  let firstX = startX;
  let lastEnd = startX;
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
    } else if (
      op.type === "modify" &&
      op.subRunIdx !== undefined &&
      op.text !== undefined
    ) {
      // Edit a mixed sub-run's EXISTING object in place: SetText the
      // surviving chars so the embedded (often subset) font is kept -
      // the glyphs were already in the object, so they always render,
      // unlike a borrowed-handle re-emit. Shift by the accumulated
      // offset and remeasure to keep following sub-runs aligned.
      absorbDeletesBefore(op.subRunIdx);
      const ptr = plan.prevMergedFromPtrs[op.subRunIdx];
      const origBounds = plan.prevMergedFromBounds[op.subRunIdx];
      const origWidth = origBounds.right - origBounds.x;
      setObjText(m, ptr, op.text);
      if (Math.abs(offset) > 0.05) {
        try {
          m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, offset, 0);
        } catch {
          /* best-effort */
        }
      }
      const newX = origBounds.x + offset;
      const measuredRight = measureObjRightEdgePt(m, ptr);
      const newRight = measuredRight > newX ? measuredRight : newX + origWidth;
      newMergedFromPtrs.push(ptr);
      newMergedFromTexts.push(op.text);
      newMergedFromBounds.push({ x: newX, right: newRight });
      newMergedFromCharStarts.push(op.startBIdx);
      if (newRight > lastEnd) lastEnd = newRight;
      // Subsequent sub-runs shift by the width delta (surviving text is
      // usually narrower than the original).
      offset += newRight - newX - origWidth;
    } else if (op.type === "insert" && op.text) {
      const insertText = op.text;
      const anchorIdx = op.anchorSubRunIdx;
      const beforeIdx = op.anchorBeforeSubRunIdx;
      if (anchorIdx !== undefined) absorbDeletesBefore(anchorIdx);
      else if (beforeIdx !== undefined) absorbDeletesBefore(beforeIdx);
      const origBounds =
        anchorIdx !== undefined ? plan.prevMergedFromBounds[anchorIdx] : null;
      // "prefix of the following word" anchor: emit at that kept sub-run's
      // original left edge so the insert + the glyphs after it read as one
      // word. The following keeps shift right by the full inserted width
      // (handled by the `else` offset branch below, same as an unanchored
      // insert), so they make room rather than overlap.
      const beforeBounds =
        beforeIdx !== undefined ? plan.prevMergedFromBounds[beforeIdx] : null;
      // Anchor priority:
      //   * anchorSubRunIdx (mixed-replacement): emit at the replaced
      //     sub-run's x; subsequent keeps shift by the WIDTH DELTA.
      //   * anchorBeforeSubRunIdx (typed-prefix): emit at the following
      //     sub-run's x; subsequent keeps shift by the FULL inserted width.
      //   * neither (typed-at-end / mid-word): emit at the running cursor,
      //     advanced past any ghost spaces typed just before it so the new
      //     text isn't glued to the preceding word.
      const leadingGap =
        (op.leadingGhostCount ?? 0) * Math.max(1, run.fontSize) * 0.25;
      const anchorX = origBounds
        ? origBounds.x + offset
        : beforeBounds
          ? beforeBounds.x + offset
          : lastEnd + leadingGap;

      // Borrow the font from a survivor that actually contains the
      // inserted chars (e.g. the neighbouring "i"), so the new glyph
      // reuses that exact embedded font. Only when every insert char is
      // already present somewhere in the line (safe), else go base-14.
      const borrowedFontPtr = allInsertCharsAreSafe
        ? borrowFontForChars(m, plan, insertText)
        : 0;

      // Try the borrowed source font first; measure the result and fall
      // back to Helvetica if the rendered width is sub-threshold (font
      // didn't have working glyphs at the chars we passed via SetText).
      let ptrs = emitTextLine({
        doc,
        page,
        text: insertText,
        x: anchorX,
        y: emitY,
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

      // Heuristic: a working glyph is at least ~0.15 * fontSize per
      // char wide (narrowest base-14 Helvetica glyph "i" is ~0.22).
      // Anything well below that means SetText returned a 0-width
      // (.notdef) glyph - the borrowed font's Unicode→CID lookup
      // failed for these chars. Re-emit via Helvetica fallback.
      const minExpected = insertText.length * run.fontSize * 0.15;
      if (borrowedFontPtr !== 0 && measuredWidth < minExpected) {
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
          y: emitY,
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
      } else if (beforeBounds) {
        offset += measuredWidth;
      } else {
        // The ghost-space gap also pushes everything after this insert right.
        offset += leadingGap + measuredWidth;
      }
    }
  }

  page.markNeedsGenerate();

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

/**
 * Paragraph-aware partial edit.
 *
 * The single-line `planPartialEdit` only sees the rep's own `mergedFrom*`
 * arrays, which for paragraphs only mirror the first line (rep IS
 * members[0]). This variant walks `run.paragraphLineSlots` instead,
 * runs the same LCS machinery per slot, and keeps every line's original
 * font when the slot has sub-run data.
 *
 * Bails (returns null) when:
 *   - the run isn't a paragraph (let `planPartialEdit` handle it)
 *   - the paragraph has no slot data (legacy paragraph rebuilt by an
 *     overlay-path edit; let the overlay path handle it again)
 *   - the user typed Enter or deleted a newline (line count changed -
 *     splitting / merging slots needs PDFium ops the slot model doesn't
 *     express yet)
 *   - any slot's per-line plan fails (mixed-survival sub-runs, etc.) -
 *     the caller falls back to overlay so we never half-apply
 */
export interface ParagraphEditPlan {
  /** Per-slot per-line plan, parallel to `run.paragraphLineSlots`. */
  perSlot: Array<{ slotIdx: number; plan: PartialEditPlan; nextLine: string }>;
  /** Snapshot of the rep's slots for revert. */
  prevSlots: ParagraphLineSlot[];
}

export function planParagraphEdit(
  run: TextRun,
  prevText: string,
  nextText: string,
): ParagraphEditPlan | null {
  if (run.paragraphLineSlots.length < 2) return null;
  if (prevText === nextText) return null;
  // Line-count guard: typing Enter or deleting a newline changes the
  // slot count. Bail to overlay for those edits.
  const prevLines = prevText.split("\n");
  const nextLines = nextText.split("\n");
  if (prevLines.length !== nextLines.length) return null;
  if (prevLines.length !== run.paragraphLineSlots.length) return null;

  const perSlot: Array<{
    slotIdx: number;
    plan: PartialEditPlan;
    nextLine: string;
  }> = [];

  for (let i = 0; i < run.paragraphLineSlots.length; i++) {
    const slot = run.paragraphLineSlots[i];
    const prevLine = prevLines[i];
    const nextLine = nextLines[i];
    if (prevLine === nextLine) continue;
    // Slots without sub-run data can't be partially edited - they're
    // single-PDFium-object lines. We could route them through SetText
    // directly, but bailing keeps the implementation small and the
    // overlay path handles the whole paragraph atomically.
    if (slot.mergedFromPtrs.length === 0) return null;

    // Build a synthetic mini-TextRun view of the slot so the existing
    // planPartialEdit / applyPartialEditPlan code can operate on it.
    const slotView = makeSlotView(run, slot, prevLine);
    const plan = planPartialEdit(slotView, prevLine, nextLine);
    if (!plan) return null;
    perSlot.push({ slotIdx: i, plan, nextLine });
  }

  if (perSlot.length === 0) return null;

  return {
    perSlot,
    prevSlots: run.paragraphLineSlots.map((s) => cloneSlot(s)),
  };
}

export interface ParagraphEditApplyResult {
  newSlots: ParagraphLineSlot[];
  insertedPtrs: number[];
  newBoundsX: number;
  newBoundsWidth: number;
}

export function applyParagraphEditPlan(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  paraPlan: ParagraphEditPlan,
  nextText: string,
): ParagraphEditApplyResult {
  const lines = nextText.split("\n");
  const newSlots: ParagraphLineSlot[] = run.paragraphLineSlots.map((s) =>
    cloneSlot(s),
  );
  const planBySlot = new Map<number, { plan: PartialEditPlan }>();
  for (const entry of paraPlan.perSlot) {
    planBySlot.set(entry.slotIdx, { plan: entry.plan });
  }

  const allInsertedPtrs: number[] = [];
  let minX = Infinity;
  let maxRight = -Infinity;

  for (let i = 0; i < newSlots.length; i++) {
    const slot = newSlots[i];
    const lineText = lines[i] ?? "";
    const planEntry = planBySlot.get(i);
    if (!planEntry) {
      // Unchanged line - keep slot data, just update bounds tracking.
      if (slot.mergedFromBounds.length > 0) {
        const first = slot.mergedFromBounds[0];
        const last = slot.mergedFromBounds[slot.mergedFromBounds.length - 1];
        if (first.x < minX) minX = first.x;
        if (last.right > maxRight) maxRight = last.right;
      }
      continue;
    }

    // Run the existing applyPartialEditPlan against the slot, emitting
    // at the slot's own baseline and starting from the slot's left x.
    const slotView = makeSlotView(run, slot, "");
    const result = applyPartialEditPlan(
      doc,
      page,
      slotView,
      planEntry.plan,
      slot.baselineY,
      slot.mergedFromBounds[0]?.x ?? slot.matrixE,
    );
    slot.mergedFromPtrs = result.newMergedFromPtrs;
    slot.mergedFromTexts = result.newMergedFromTexts;
    slot.mergedFromBounds = result.newMergedFromBounds;
    slot.mergedFromCharStarts = result.newMergedFromCharStarts;
    allInsertedPtrs.push(...result.insertedPtrs);
    if (result.newBoundsX < minX) minX = result.newBoundsX;
    if (result.newBoundsX + result.newBoundsWidth > maxRight) {
      maxRight = result.newBoundsX + result.newBoundsWidth;
    }
    // Update slot's char range against the new line text.
    slot.endChar = slot.startChar + lineText.length;
  }

  // Fix up startChar/endChar across all slots so each slot's range
  // reflects the new joined text (line lengths may have changed even on
  // slots we didn't touch via planPartialEdit if their text content
  // shifted - they're identical here, but the running cursor moves).
  let cursor = 0;
  for (let i = 0; i < newSlots.length; i++) {
    const lineLen = (lines[i] ?? "").length;
    newSlots[i].startChar = cursor;
    newSlots[i].endChar = cursor + lineLen;
    cursor += lineLen + (i < newSlots.length - 1 ? 1 : 0);
  }

  // Re-flatten leaf ptrs from the updated slots so EditTextCommand's
  // removal pass can find every original sub-object next time.
  const leafPtrs: number[] = [];
  const leafContainers: number[] = [];
  for (const s of newSlots) {
    for (const p of s.mergedFromPtrs) {
      leafPtrs.push(p);
      leafContainers.push(s.containerPtr);
    }
  }
  run.paragraphLeafPtrs = leafPtrs;
  run.paragraphLeafContainers = leafContainers;

  return {
    newSlots,
    insertedPtrs: allInsertedPtrs,
    newBoundsX: isFinite(minX) ? minX : run.bounds.x,
    newBoundsWidth: isFinite(maxRight)
      ? maxRight - (isFinite(minX) ? minX : run.bounds.x)
      : run.bounds.width,
  };
}

/**
 * Build a synthetic TextRun "view" of a paragraph slot so the existing
 * planPartialEdit / applyPartialEditPlan can operate on it. Only the
 * fields those functions read are populated; everything else stays at
 * the run's value (most importantly `fill` for emit color).
 */
function makeSlotView(
  run: TextRun,
  slot: ParagraphLineSlot,
  text: string,
): TextRun {
  return {
    ...run,
    text,
    fontId: slot.fontId,
    fontSize: slot.fontSize,
    fontSubset: slot.fontSubset,
    containerPtr: slot.containerPtr,
    matrix: { ...run.matrix, e: slot.matrixE, f: slot.baselineY },
    bounds: {
      x: slot.mergedFromBounds[0]?.x ?? slot.matrixE,
      y: run.bounds.y,
      width:
        (slot.mergedFromBounds[slot.mergedFromBounds.length - 1]?.right ??
          slot.matrixE) - (slot.mergedFromBounds[0]?.x ?? slot.matrixE),
      height: slot.fontSize * 1.2,
    },
    mergedFromPtrs: slot.mergedFromPtrs,
    mergedFromTexts: slot.mergedFromTexts,
    mergedFromBounds: slot.mergedFromBounds,
    mergedFromCharStarts: slot.mergedFromCharStarts,
  } as TextRun;
}

function cloneSlot(s: ParagraphLineSlot): ParagraphLineSlot {
  return {
    startChar: s.startChar,
    endChar: s.endChar,
    baselineY: s.baselineY,
    matrixE: s.matrixE,
    containerPtr: s.containerPtr,
    fontId: s.fontId,
    fontSize: s.fontSize,
    fontSubset: s.fontSubset,
    mergedFromPtrs: [...s.mergedFromPtrs],
    mergedFromTexts: [...s.mergedFromTexts],
    mergedFromBounds: s.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...s.mergedFromCharStarts],
  };
}
