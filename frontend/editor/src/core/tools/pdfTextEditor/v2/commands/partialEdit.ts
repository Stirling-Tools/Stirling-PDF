import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";
import {
  emitTextLine,
  isVerifiedPerCharPtr,
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

/** Read a text object's left/right edge in page points. */
function objBoundsLR(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptr: number,
  fallbackX: number,
): { x: number; right: number } {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(ptr, l, b, r, t)) {
      return { x: fallbackX, right: fallbackX };
    }
    return {
      x: m.pdfium.getValue(l, "float"),
      right: m.pdfium.getValue(r, "float"),
    };
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}

/**
 * Map freshly-emitted line objects back to their words, building the slot's
 * mergedFrom* arrays (one entry per ptr with its word text / char-start /
 * real PDFium bounds). emitTextLine emits one object per whitespace word.
 */
function buildSlotMerged(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptrs: number[],
  text: string,
  leftX: number,
): {
  ptrs: number[];
  texts: string[];
  bounds: Array<{ x: number; right: number }>;
  charStarts: number[];
} {
  const outPtrs: number[] = [];
  const texts: string[] = [];
  const bounds: Array<{ x: number; right: number }> = [];
  const charStarts: number[] = [];
  const words: Array<{ text: string; start: number }> = [];
  const re = /\S+/g;
  let wm: RegExpExecArray | null;
  while ((wm = re.exec(text)) !== null) {
    words.push({ text: wm[0], start: wm.index });
  }
  for (let i = 0; i < ptrs.length; i++) {
    const w = words[i];
    const b = objBoundsLR(m, ptrs[i], leftX);
    outPtrs.push(ptrs[i]);
    texts.push(w ? w.text : "");
    bounds.push({ x: b.x, right: b.right });
    charStarts.push(w ? w.start : text.length);
  }
  return { ptrs: outPtrs, texts, bounds, charStarts };
}

/**
 * Astral characters (emoji, math symbols, CJK ext-B) are two UTF-16 code
 * units. The LCS + char->sub-run maps below index by code unit, so an EXISTING
 * astral char in prevText could be split across keep/drop and emit a lone
 * surrogate (tofu). We only guard prevText: a NEW astral char in an insert is
 * emitted whole-word by emitTextLine (and sanitised in the base-14 fallback),
 * so it never splits - and the insert can proceed without bailing the whole
 * paragraph (which would drop every other line's source objects).
 */
function hasSurrogatePair(s: string): boolean {
  return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(s);
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
  if (hasSurrogatePair(prevText)) return null;

  let { keptA, keptB, alignment } = lcsIndices(prevText, nextText);

  // Pure append (nextText starts with prevText): force the trivial 1:1 prefix
  // alignment. The generic LCS can otherwise match a repeated char in prevText
  // (e.g. the "o" in "hello") to a LATER occurrence in nextText (the "o" in an
  // appended "world"), scattering the inserted suffix into mis-ordered pieces
  // ("hello" + "world" -> "helloo wrld"). Anchoring prev to the prefix keeps
  // the kept text contiguous and the whole suffix as one ordered insert.
  if (nextText.startsWith(prevText)) {
    keptA = new Set();
    keptB = new Set();
    alignment = [];
    for (let i = 0; i < prevText.length; i++) {
      keptA.add(i);
      keptB.add(i);
      alignment.push({ aIdx: i, bIdx: i });
    }
  }

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
    else if (surviving.trim() === "") {
      // Only whitespace survives this partially-deleted sub-run. SetText-ing a
      // lone space back onto the (often Type3) source object renders it as
      // U+00FF ("ÿ") tofu - that font has no space glyph. Drop the object
      // instead; the gap is carried positionally by the surrounding glyphs.
      subRunStatus.push("all-deleted");
    } else {
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
  // Workaround we DO ship: borrow a survivor font ONLY for chars proven
  // present in the line (the surviving-chars pool), measure the rendered
  // width, and fall back to Helvetica when broken. Borrowing for an
  // arbitrary new char (not in the pool) is unsafe: FPDFText_SetText maps an
  // unknown char to glyph 0xFF (ydieresis tofu) which can pass the per-word
  // width check when other chars in the same word render. Real charcode
  // resolution for new chars lives in emitTextLine's per-char backend branch
  // (used when the backend is reachable); this path stays base-14-safe.
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
        if (!b) continue;
        // Subtract the deleted sub-run's ADVANCE (distance to the next
        // sub-run's left edge), not just its ink width, so the following kept
        // glyphs shift left to exactly where the deleted one began - fully
        // closing the gap. Ink width left a residual gap that ReflowWrap's
        // word-grouping later read as a spurious inter-word space (e.g.
        // deleting a mid-word char produced "Compre ensive"). Falls back to
        // ink width for the last sub-run (no following one to measure against).
        const next = plan.prevMergedFromBounds[i + 1];
        offset -= next && next.x > b.x ? next.x - b.x : b.right - b.x;
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

      // Borrow the font from a survivor that actually contains the inserted
      // chars (e.g. the neighbouring "i"), so the new glyph reuses that exact
      // embedded font - but ONLY when every insert char is already present in
      // the line (safe). Borrowing for an arbitrary new char (e.g. "W" not in
      // the subset) and writing it via SetText renders U+00FF tofu when the
      // backend charcode resolver isn't available, and the per-word width
      // check can't catch a single bad char. The per-char backend branch in
      // emitTextLine handles real charcode resolution when the backend IS
      // reachable; this fallback stays base-14-safe for unsafe chars.
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
      // Skip the tofu retry when ALL returned ptrs came from the
      // per-char backend emit branch in emitTextLine. Those ptrs were
      // created with known-good (font, charcode) pairs from the
      // backend resolver cache; a sub-threshold measurement just
      // means PDFium's page content stream hasn't been regenerated
      // yet, NOT that the glyph is broken. Without this gate a second
      // consecutive edit would fire a duplicate per-char emit on top
      // of a still-rendering first emit, leaving visible
      // .notdef-stripe artefacts that FPDFPage_RemoveObject can't
      // always clear cleanly (form-xobject Type3 case).
      const allVerified =
        ptrs.length > 0 && ptrs.every((p) => isVerifiedPerCharPtr(p));
      if (
        !allVerified &&
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
      // Add the advance width of whitespace chars (FPDFPageObj_GetBounds
      // excludes invisible glyphs) so the offset that shifts following kept
      // sub-runs accounts for inserted spaces - otherwise "AlternativeHi"
      // renders with no gap.
      const whitespaceLen = insertText.length - nonWhitespaceLen;
      if (whitespaceLen > 0) {
        const wsWidth = measureWhitespaceAdvancePt(
          " ".repeat(whitespaceLen),
          fallbackFamily,
          run.fontSize,
        );
        measuredWidth += wsWidth;
      }
      // Map emitted ptrs back to text. emitTextLine emits one ptr per
      // whitespace-separated WORD on the normal path, but one ptr per CHAR on
      // the per-char backend branch. Discriminate by count: when the ptrs line
      // up with words, use the accurate word mapping (and drop any stray
      // empty-word ptr so it can't read back as U+00FF tofu); otherwise slice
      // insertText across the ptrs so each entry stores its own slice (the next
      // edit's sanity check compares prevText.slice against the stored text).
      const insertWords: Array<{ text: string; start: number }> = [];
      {
        const wordRe = /\S+/g;
        let wm: RegExpExecArray | null;
        while ((wm = wordRe.exec(insertText)) !== null) {
          insertWords.push({ text: wm[0], start: wm.index });
        }
      }
      if (ptrs.length === insertWords.length) {
        for (let i = 0; i < ptrs.length; i++) {
          const word = insertWords[i];
          if (!word) {
            try {
              m.FPDFPage_RemoveObject(page.pagePtr, ptrs[i]);
            } catch {
              /* best-effort */
            }
            continue;
          }
          const bnds = objBoundsLR(m, ptrs[i], anchorX);
          newMergedFromPtrs.push(ptrs[i]);
          newMergedFromTexts.push(word.text);
          newMergedFromBounds.push({ x: bnds.x, right: bnds.right });
          newMergedFromCharStarts.push(op.startBIdx + word.start);
          insertedPtrs.push(ptrs[i]);
        }
      } else {
        // Per-char (or mismatched) emit: slice the insert text across ptrs.
        let runningCursor = anchorX;
        const charsPerPtr = Math.max(
          1,
          Math.floor(insertText.length / Math.max(1, ptrs.length)),
        );
        let charCursor = 0;
        for (let i = 0; i < ptrs.length; i++) {
          const sliceWidth = measuredWidth / ptrs.length;
          const isLast = i === ptrs.length - 1;
          const sliceText = isLast
            ? insertText.slice(charCursor)
            : insertText.slice(charCursor, charCursor + charsPerPtr);
          newMergedFromPtrs.push(ptrs[i]);
          newMergedFromTexts.push(sliceText);
          newMergedFromBounds.push({
            x: runningCursor,
            right: runningCursor + sliceWidth,
          });
          newMergedFromCharStarts.push(op.startBIdx + charCursor);
          insertedPtrs.push(ptrs[i]);
          runningCursor += sliceWidth;
          charCursor += sliceText.length;
        }
      }
      if (realRightEdge > lastEnd) lastEnd = realRightEdge;
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
  /**
   * Per-slot per-line plan, parallel to `run.paragraphLineSlots`. A null
   * `plan` means "re-emit this whole line fresh" - used when the line can't
   * be partially edited (an empty line that gained text, or a per-line LCS
   * that failed). Only THAT line loses its source font; every other line
   * keeps its original objects.
   */
  perSlot: Array<{
    slotIdx: number;
    plan: PartialEditPlan | null;
    nextLine: string;
  }>;
  /** Per-VISUAL-line next text, parallel to `run.paragraphLineSlots`. */
  nextLines: string[];
  /** Snapshot of the rep's slots for revert. */
  prevSlots: ParagraphLineSlot[];
}

/** Count occurrences of a single char in a string. */
function countChar(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) n++;
  return n;
}

/**
 * True when a plan would SetText whitespace in place via a "modify" op.
 * Such an op paints „ on an embedded subset font with no space glyph, so the
 * caller re-emits the line word-split instead. (Multi-word single-object
 * sub-runs - e.g. a whole LaTeX line as one PDFium object - hit this.)
 */
export function planModifiesWhitespace(plan: PartialEditPlan): boolean {
  return plan.ops.some(
    (op) => op.type === "modify" && !!op.text && /\s/.test(op.text),
  );
}

/** Read a text object's own font handle (0 when unavailable). */
function objFontPtr(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptr: number,
): number {
  const fontMod = m as unknown as FontReadingModule;
  if (!ptr || !fontMod.FPDFTextObj_GetFont) return 0;
  try {
    return fontMod.FPDFTextObj_GetFont(ptr) || 0;
  } catch {
    return 0;
  }
}

/**
 * Locate the single contiguous edit between `prev` and `next` via a
 * prefix/suffix scan. Returns the changed span: `[start, prevEnd)` in
 * `prev` maps to `[start, nextEnd)` in `next`.
 */
function diffSpan(
  prev: string,
  next: string,
): { start: number; prevEnd: number; nextEnd: number } {
  const minLen = Math.min(prev.length, next.length);
  let start = 0;
  while (start < minLen && prev[start] === next[start]) start++;
  let end = 0;
  while (
    end < minLen - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }
  return { start, prevEnd: prev.length - end, nextEnd: next.length - end };
}

/**
 * Verify the slot char ranges exactly tile `text` with one-char separators
 * between visual lines (`[startChar, endChar)` per slot, a single separator
 * at each `endChar`, last slot ending at `text.length`). When `run.text`
 * desyncs from the slot model this returns false so the caller bails to the
 * overlay path instead of slicing garbage.
 */
function slotsTileText(slots: ParagraphLineSlot[], text: string): boolean {
  if (slots.length === 0) return false;
  if (slots[0].startChar !== 0) return false;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.endChar < s.startChar || s.endChar > text.length) return false;
    if (i > 0 && s.startChar !== slots[i - 1].endChar + 1) return false;
  }
  return slots[slots.length - 1].endChar === text.length;
}

export function planParagraphEdit(
  run: TextRun,
  prevText: string,
  nextText: string,
): ParagraphEditPlan | null {
  const slots = run.paragraphLineSlots;
  if (slots.length < 2) return null;
  if (prevText === nextText) return null;
  if (hasSurrogatePair(prevText)) return null;
  // Per-VISUAL-line text comes from the slot char ranges, NOT split("\n").
  // run.text joins visual lines with ONE-char separators that are "\n" for
  // hard (user) breaks but " " for soft word-wraps, so split("\n") under-
  // counts lines the moment a paragraph soft-wraps - which used to bail the
  // edit to the whole-paragraph overlay re-emit and collapse every line.
  if (!slotsTileText(slots, prevText)) return null;
  const prevLines = slots.map((s) => prevText.slice(s.startChar, s.endChar));

  // A change in the count of hard breaks ("\n") is a structural line
  // add/remove the slot model can't express; let the line-edit path handle
  // it. (Soft-wrap separators are spaces and never change via typing.)
  if (countChar(prevText, "\n") !== countChar(nextText, "\n")) return null;

  // The edit must be confined to a single visual line. Find the slot whose
  // range fully contains the changed span; an edit that crosses a separator
  // or spans two slots is structural - bail.
  const span = diffSpan(prevText, nextText);
  let hitSlot = -1;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (span.start >= s.startChar && span.prevEnd <= s.endChar) {
      hitSlot = i;
      break;
    }
  }
  if (hitSlot < 0) return null;

  // Only the hit slot's text changes; its new length shifts by the edit
  // delta. Every other visual line is untouched.
  const delta = nextText.length - prevText.length;
  const nextLines = prevLines.slice();
  const hit = slots[hitSlot];
  nextLines[hitSlot] = nextText.slice(hit.startChar, hit.endChar + delta);

  const perSlot: Array<{
    slotIdx: number;
    plan: PartialEditPlan | null;
    nextLine: string;
  }> = [];

  const prevLine = prevLines[hitSlot];
  const nextLine = nextLines[hitSlot];
  if (prevLine === nextLine) return null;
  // A slot with no sub-run objects can't be partially edited (e.g. an
  // empty line the user just typed the first character into). Re-emit
  // ONLY this line fresh - every other line keeps its original objects.
  if (hit.mergedFromPtrs.length === 0) {
    perSlot.push({ slotIdx: hitSlot, plan: null, nextLine });
  } else {
    // Build a synthetic mini-TextRun view of the slot so the existing
    // planPartialEdit / applyPartialEditPlan code can operate on it.
    const slotView = makeSlotView(run, hit, prevLine);
    let plan = planPartialEdit(slotView, prevLine, nextLine);
    // An in-place "modify" op re-SetTexts a sub-run's surviving chars. When
    // that sub-run spans multiple words (one PDFium object for a whole line,
    // common in LaTeX output) the surviving text carries spaces - and
    // FPDFText_SetText paints „ for a space on an embedded subset font with
    // no space glyph (the glyph at subset code 0x20). Re-emit the whole line
    // fresh (word-split, inter-word spaces become positional gaps) instead.
    if (plan && planModifiesWhitespace(plan)) plan = null;
    // Per-line LCS couldn't model the change - re-emit just this line
    // rather than failing the whole paragraph to the overlay re-emit.
    perSlot.push({ slotIdx: hitSlot, plan: plan ?? null, nextLine });
  }

  return {
    perSlot,
    nextLines,
    prevSlots: slots.map((s) => cloneSlot(s)),
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
): ParagraphEditApplyResult {
  const m = doc.module;
  // Per-VISUAL-line next text from the plan (slot-range derived). Splitting
  // nextText on "\n" would under-count lines for soft-wrapped paragraphs and
  // leave trailing slots empty - the line-collapse bug.
  const lines = paraPlan.nextLines;
  const newSlots: ParagraphLineSlot[] = run.paragraphLineSlots.map((s) =>
    cloneSlot(s),
  );
  const planBySlot = new Map<
    number,
    { plan: PartialEditPlan | null; nextLine: string }
  >();
  for (const entry of paraPlan.perSlot) {
    planBySlot.set(entry.slotIdx, {
      plan: entry.plan,
      nextLine: entry.nextLine,
    });
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

    if (planEntry.plan === null) {
      // Fresh-emit line: this line couldn't be partially edited (empty line
      // that gained text, an LCS that failed, or an in-place edit that would
      // SetText whitespace onto a no-space-glyph subset font -> „). Re-emit
      // the line word-split, REUSING the source font where it renders so the
      // glyphs still match; emitTextLine self-validates each word and falls
      // back to base-14 only where the reused font produces .notdef.
      const leftX = slot.mergedFromBounds[0]?.x ?? slot.matrixE;
      // Read the font handle BEFORE the objects are removed.
      const reuseFontPtr = objFontPtr(m, slot.mergedFromPtrs[0] ?? 0);
      for (const ptr of slot.mergedFromPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
      const fallbackFamily = helveticaVariantFor(run.fontId);
      if (lineText.length > 0) {
        const ptrs = emitTextLine({
          doc,
          page,
          text: lineText,
          x: leftX,
          y: slot.baselineY,
          fontSize: slot.fontSize,
          fill: run.fill,
          originalFontPtr: reuseFontPtr,
          fallbackFamily,
        });
        const built = buildSlotMerged(m, ptrs, lineText, leftX);
        slot.mergedFromPtrs = built.ptrs;
        slot.mergedFromTexts = built.texts;
        slot.mergedFromBounds = built.bounds;
        slot.mergedFromCharStarts = built.charStarts;
        // Only drop to a base-14 identity when the source font wasn't reused;
        // otherwise keep the slot's font so the NEXT edit reuses it again.
        if (reuseFontPtr === 0) {
          slot.fontId = `base14:${fallbackFamily}`;
          slot.fontSubset = false;
        }
        slot.containerPtr = 0;
        allInsertedPtrs.push(...ptrs);
        for (const b of built.bounds) {
          if (b.x < minX) minX = b.x;
          if (b.right > maxRight) maxRight = b.right;
        }
      } else {
        slot.mergedFromPtrs = [];
        slot.mergedFromTexts = [];
        slot.mergedFromBounds = [];
        slot.mergedFromCharStarts = [];
      }
      slot.endChar = slot.startChar + lineText.length;
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
