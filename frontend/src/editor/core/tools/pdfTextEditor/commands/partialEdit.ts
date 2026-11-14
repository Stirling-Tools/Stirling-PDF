import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  charcodesResolveFully,
  collectContainersByPtr,
  contentIndices,
  cssFontSpecFor,
  restoreContentOrder,
  emitTextLine,
  readObjTexts,
  type FontSpan,
  inkFromRun,
  isVerifiedPerCharPtr,
  measureObjRightEdgePt,
  moveObjectLeftEdgeTo,
  removeAndDestroyObject,
  removeTextObject,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  fallbackFamilyFor,
  fallbackFontIdFor,
} from "@editor/tools/pdfTextEditor/util/fontCapability";
import { writeUtf16 } from "@editor/services/pdfiumService";
import {
  sliceTags,
  uniformTags,
  type TextTags,
} from "@editor/tools/pdfTextEditor/model/TextTags";
import { readTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { readMatrix } from "@editor/tools/pdfTextEditor/commands/textPieces";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";
import { deviceFamilyOf } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

/** Set the text of an EXISTING PDFium text object, preserving its font. */
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
  const buf = scratchPtr(m, SCRATCH.partialBbox, 16);
  if (!m.FPDFPageObj_GetBounds(ptr, buf, buf + 4, buf + 8, buf + 12)) {
    return { x: fallbackX, right: fallbackX };
  }
  return {
    x: m.pdfium.getValue(buf, "float"),
    right: m.pdfium.getValue(buf + 8, "float"),
  };
}

// Map freshly-emitted line objects back to the text they carry, building the
// slot's mergedFrom* arrays. `emitted` is emitTextLine's own record of what
// each ptr holds - it emits per word OR per character, so deriving it from the
// text mislabels every ptr past the word count.
function buildSlotMerged(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptrs: number[],
  text: string,
  leftX: number,
  emitted?: string[],
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
  if (emitted && emitted.length === ptrs.length) {
    let at = 0;
    for (const piece of emitted) {
      const found = text.indexOf(piece, at);
      const start = found >= 0 ? found : at;
      words.push({ text: piece, start });
      at = start + piece.length;
    }
  } else {
    const re = /\S+/g;
    let wm: RegExpExecArray | null;
    while ((wm = re.exec(text)) !== null) {
      words.push({ text: wm[0], start: wm.index });
    }
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

// Astral characters (emoji, math symbols, CJK ext-B) are two UTF-16 code units.
// The planners index by code UNIT, so a boundary landing between the halves
// would emit a lone surrogate. The helpers below let the planners bail only on
// the edits that actually cut a pair, instead of on any text containing one.
const HI_MIN = 0xd800;
const HI_MAX = 0xdbff;
const LO_MIN = 0xdc00;
const LO_MAX = 0xdfff;

/** Any surrogate code unit at all - BMP-only text skips every check below. */
function hasAnySurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u >= HI_MIN && u <= LO_MAX) return true;
  }
  return false;
}

/** No orphaned half: every high surrogate is followed by its low. */
function isWellFormedUtf16(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u >= HI_MIN && u <= HI_MAX) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next < LO_MIN || next > LO_MAX) return false;
      i++;
      continue;
    }
    if (u >= LO_MIN && u <= LO_MAX) return false;
  }
  return true;
}

/** True when slicing `s` at code-unit `idx` would not cut a surrogate pair. */
function isCodePointBoundary(s: string, idx: number): boolean {
  if (idx <= 0 || idx >= s.length) return true;
  const before = s.charCodeAt(idx - 1);
  const at = s.charCodeAt(idx);
  return !(
    before >= HI_MIN &&
    before <= HI_MAX &&
    at >= LO_MIN &&
    at <= LO_MAX
  );
}

/** Push a slice end off the middle of a pair so no half is orphaned. */
function toCodePointBoundary(s: string, idx: number): number {
  return isCodePointBoundary(s, idx) ? idx : idx + 1;
}

// Both halves of every astral char must share the SAME fate in the diff, and a
// kept pair must stay adjacent on the other side. Sibling emoji share a high
// surrogate (U+1F600 and U+1F601 are both \uD83D...), so the code-unit LCS can
// match the highs and drop the lows - exactly the case this rejects.
function surrogatePairsSurviveTogether(
  prev: string,
  next: string,
  keptA: Set<number>,
  keptB: Set<number>,
  alignment: Alignment,
): boolean {
  const aToB = new Map<number, number>();
  const bToA = new Map<number, number>();
  for (const { aIdx, bIdx } of alignment) {
    aToB.set(aIdx, bIdx);
    bToA.set(bIdx, aIdx);
  }
  for (let a = 0; a + 1 < prev.length; a++) {
    const hi = prev.charCodeAt(a);
    if (hi < HI_MIN || hi > HI_MAX) continue;
    const lo = prev.charCodeAt(a + 1);
    if (lo < LO_MIN || lo > LO_MAX) continue;
    if (keptA.has(a) !== keptA.has(a + 1)) return false;
    if (keptA.has(a) && aToB.get(a + 1) !== (aToB.get(a) ?? -2) + 1)
      return false;
    a++;
  }
  for (let b = 0; b + 1 < next.length; b++) {
    const hi = next.charCodeAt(b);
    if (hi < HI_MIN || hi > HI_MAX) continue;
    const lo = next.charCodeAt(b + 1);
    if (lo < LO_MIN || lo > LO_MAX) continue;
    if (keptB.has(b) !== keptB.has(b + 1)) return false;
    if (keptB.has(b) && bToA.get(b + 1) !== (bToA.get(b) ?? -2) + 1)
      return false;
    b++;
  }
  return true;
}

/** Diff-driven partial editing. */
export interface PartialEditOp {
  type: "keep" | "insert" | "modify";
  /** keep / modify: sub-run index in run.mergedFromPtrs */
  subRunIdx?: number;
  /** insert: text to emit in fallback font. modify: surviving chars to
   * SetText onto the existing object (keeps its embedded font). */
  text?: string;
  // insert only: the original sub-run this insert is replacing (came from a
  // "mixed" sub-run whose kept chars need a new emit).
  anchorSubRunIdx?: number;
  /** insert only: the FOLLOWING kept sub-run this insert is a prefix of. */
  anchorBeforeSubRunIdx?: number;
  // insert only: how many whitespace chars in nextText sit between the previous
  // emitted glyph and this insert but belong to NO sub-run.
  leadingGhostCount?: number;
  /** Position in nextText where this op's first char lives. */
  startBIdx: number;
}

export interface PartialEditPlan {
  removePtrs: Array<{ ptr: number; containerPtr: number }>;
  ops: PartialEditOp[];
  /** Per-sub-run status (parallel to prevMergedFromPtrs). */
  subRunStatus: Array<"all-kept" | "all-deleted" | "mixed">;
  /** Snapshot of current model arrays for revert. */
  prevMergedFromPtrs: number[];
  prevMergedFromTexts: string[];
  prevMergedFromBounds: Array<{ x: number; right: number }>;
  /** The edited text that every op's startBIdx indexes into. */
  nextText: string;
}

export type Alignment = Array<{ aIdx: number; bIdx: number }>;

function lcsIndices(
  a: string,
  b: string,
): {
  keptA: Set<number>;
  keptB: Set<number>;
  alignment: Alignment;
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
  const alignment: Alignment = [];
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

const MAX_STRANDED_KEEP = 2;
const MAX_KEPT_SHARE = 0.5;

function isWordChar(ch: string): boolean {
  return /\S/.test(ch);
}

function mostlyDeletedWord(
  prevText: string,
  keptA: Set<number>,
  at: number,
): boolean {
  let from = at;
  while (from > 0 && isWordChar(prevText[from - 1])) from--;
  let to = at;
  while (to + 1 < prevText.length && isWordChar(prevText[to + 1])) to++;
  let kept = 0;
  for (let a = from; a <= to; a++) if (keptA.has(a)) kept++;
  return kept < (to - from + 1) * MAX_KEPT_SHARE;
}

// A kept letter of a deleted word inside a typed one stays put and opens gaps, so retype it.
function withoutStrandedGlyphs(
  prevText: string,
  nextText: string,
  keptA: Set<number>,
  keptB: Set<number>,
  alignment: Alignment,
): {
  keptA: Set<number>;
  keptB: Set<number>;
  alignment: Alignment;
} {
  const typedLetter = (b: number) =>
    b >= 0 && b < nextText.length && !keptB.has(b) && isWordChar(nextText[b]);
  const deletedLetter = (a: number) =>
    a >= 0 && a < prevText.length && !keptA.has(a) && isWordChar(prevText[a]);
  const stranded = new Set<number>();
  for (let i = 0; i < alignment.length;) {
    let j = i;
    while (
      j + 1 < alignment.length &&
      alignment[j + 1].bIdx === alignment[j].bIdx + 1 &&
      alignment[j + 1].aIdx === alignment[j].aIdx + 1
    )
      j++;
    const { aIdx: fromA, bIdx: b } = alignment[i];
    const { aIdx: toA, bIdx: end } = alignment[j];
    if (
      end - b + 1 <= MAX_STRANDED_KEEP &&
      (deletedLetter(fromA - 1) || deletedLetter(toA + 1)) &&
      mostlyDeletedWord(prevText, keptA, fromA) &&
      (typedLetter(b - 1) || typedLetter(end + 1))
    )
      for (let k = b; k <= end; k++) stranded.add(k);
    i = j + 1;
  }
  if (stranded.size === 0) return { keptA, keptB, alignment };
  const kept = alignment.filter(({ bIdx }) => !stranded.has(bIdx));
  // Retyping one letter can strand its neighbour ("ua" then "l" of "Annual"), so repeat.
  return withoutStrandedGlyphs(
    prevText,
    nextText,
    new Set(kept.map(({ aIdx }) => aIdx)),
    new Set(kept.map(({ bIdx }) => bIdx)),
    kept,
  );
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
  // Astral text is diffed in code UNITS. Rather than refusing every run that
  // holds a pair, refuse only the edits that would cut one (checked below).
  const astral = hasAnySurrogate(prevText) || hasAnySurrogate(nextText);
  if (
    astral &&
    (!isWellFormedUtf16(prevText) || !isWellFormedUtf16(nextText))
  ) {
    return null;
  }

  let { keptA, keptB, alignment } = lcsIndices(prevText, nextText);

  // Pure append (nextText starts with prevText): force the trivial 1:1 prefix
  // alignment.
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

  ({ keptA, keptB, alignment } = withoutStrandedGlyphs(
    prevText,
    nextText,
    keptA,
    keptB,
    alignment,
  ));

  // Only now, against the alignment the ops walk will actually use: a diff
  // boundary landing inside an astral char would emit a lone surrogate.
  if (
    astral &&
    !surrogatePairsSurviveTogether(prevText, nextText, keptA, keptB, alignment)
  ) {
    return null;
  }

  // Read per-sub-run char-start positions directly off the run.
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
    // A sub-run split mid-pair would make "modify" SetText half a char.
    if (
      astral &&
      (!isCodePointBoundary(prevText, start) ||
        !isCodePointBoundary(prevText, end))
    ) {
      return null;
    }
    for (let c = start; c < end; c++) {
      charToSubRun[c] = i;
    }
    subRunRanges.push({ start, end });
  }

  // Classify sub-runs by counting how many of their own chars (the
  // tracked range, not ghost gaps) survived the LCS.
  const subRunStatus: Array<"all-kept" | "all-deleted" | "mixed"> = [];
  const mixedSubRuns = new Set<number>();
  // For each mixed sub-run, the surviving chars (in original order).
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
      // Only whitespace survives this partially-deleted sub-run.
      subRunStatus.push("all-deleted");
    } else {
      subRunStatus.push("mixed");
      mixedSubRuns.add(i);
      mixedSurviving.set(i, surviving);
    }
  }

  // Build ops by walking nextText.
  const ops: PartialEditOp[] = [];
  let lastSubRun = -1;
  let insertBuf = "";
  let insertAnchorSubRun: number | undefined;
  let insertStartBIdx = 0;
  // bIdx of the last char that produced (or rode on) a glyph - i.e. a kept real
  // char, a modified char, or an inserted char.
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

  // A piece typed into mid-word keeps no contiguous stretch of its letters, so
  // SetText cannot patch it: redraw that piece whole, in its own place, and
  // leave the rest of the line's objects untouched.
  const replacedSubRuns = new Set<number>();
  {
    const keptMin = new Map<number, number>();
    const keptMax = new Map<number, number>();
    const keptCnt = new Map<number, number>();
    for (const b of keptB) {
      const a = bToA.get(b);
      if (a === undefined) continue;
      const sr = charToSubRun[a];
      if (sr < 0) continue;
      keptMin.set(sr, Math.min(keptMin.get(sr) ?? b, b));
      keptMax.set(sr, Math.max(keptMax.get(sr) ?? b, b));
      keptCnt.set(sr, (keptCnt.get(sr) ?? 0) + 1);
    }
    for (const [sr, cnt] of keptCnt) {
      if (keptMax.get(sr)! - keptMin.get(sr)! + 1 !== cnt)
        replacedSubRuns.add(sr);
    }
    for (const { aIdx, bIdx } of alignment) {
      if (!replacedSubRuns.has(charToSubRun[aIdx])) continue;
      keptA.delete(aIdx);
      keptB.delete(bIdx);
    }
    for (const sr of replacedSubRuns) {
      subRunStatus[sr] = "all-deleted";
      mixedSubRuns.delete(sr);
      mixedSurviving.delete(sr);
    }
  }

  for (let b = 0; b < nextText.length; b++) {
    if (keptB.has(b)) {
      const a = bToA.get(b)!;
      const subRunIdx = charToSubRun[a];
      // Ghost char (LineGrouper-synthesised whitespace, not part of any PDFium
      // text object).
      if (subRunIdx === -1) continue;
      // Whitespace-only survivor of a now-deleted sub-run: drop, never keep its ptr.
      if (subRunStatus[subRunIdx] === "all-deleted") continue;
      // Surviving chars of a mixed sub-run keep their ORIGINAL embedded font:
      // we SetText the surviving substring back onto the existing.
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
      // A pending pure-insert that ends in a non-whitespace char, sits at the
      // START of this NEW sub-run.
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
      const replaced = charToSubRun[bToA.get(b) ?? -1];
      if (
        insertAnchorSubRun === undefined &&
        replaced !== undefined &&
        replacedSubRuns.has(replaced)
      ) {
        if (insertBuf.length > 0) flushInsert();
        insertAnchorSubRun = replaced;
      }
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

  // Collect removals: only ALL-deleted sub-runs.
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
    nextText,
  };
}

let _wsMeasureCanvas: HTMLCanvasElement | null = null;
/** Canvas-measured advance width for whitespace chars. */
function measureWhitespaceAdvancePt(
  text: string,
  fontFamily: string,
  fontSizePt: number,
): number {
  if (typeof document === "undefined") return text.length * fontSizePt * 0.27;
  if (!_wsMeasureCanvas) _wsMeasureCanvas = document.createElement("canvas");
  const ctx = _wsMeasureCanvas.getContext("2d");
  if (!ctx) return text.length * fontSizePt * 0.27;
  // px on purpose: an n-px font measured in px returns the same number as
  // an n-pt font in pt; `${n}pt` would inflate the result by 4/3.
  ctx.font = cssFontSpecFor(fontFamily, fontSizePt);
  return ctx.measureText(text).width;
}

interface FontReadingModule {
  FPDFTextObj_GetFont?: (ptr: number) => number;
}

// Borrow the font handle from the FIRST surviving sub-object that wasn't slated
// for removal.
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

// Borrow the font of a surviving sub-object that ACTUALLY CONTAINS the
// characters we're about to insert.
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

// The font a redrawn piece was first drawn in. A word typed against it can push the whole piece into a fallback face; once the typed letters move away, the words that font draws go back to it.
const sourceFonts = new WeakMap<EditorDocument, Map<number, number>>();

function sourceFontsOf(doc: EditorDocument): Map<number, number> {
  let fonts = sourceFonts.get(doc);
  if (!fonts) {
    fonts = new Map();
    sourceFonts.set(doc, fonts);
  }
  return fonts;
}

function sourceFontOf(doc: EditorDocument, ptr: number): number {
  return sourceFontsOf(doc).get(ptr) ?? objFontPtr(doc.module, ptr);
}

export interface PartialEditApplyResult {
  newMergedFromPtrs: number[];
  newMergedFromTexts: string[];
  newMergedFromBounds: Array<{ x: number; right: number }>;
  /** Per-sub-run char-start positions in the NEW run.text (post-edit). */
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
  /** The edited text's tags: what each insert is drawn with. */
  tags: TextTags,
  /** Override the baseline used for emitted inserts. */
  baselineY?: number,
  // Override the left edge used for the FIRST unanchored insert (before any
  // keep op has set the cursor).
  defaultX?: number,
): PartialEditApplyResult {
  const m = doc.module;
  const emitY = baselineY ?? run.matrix.f;
  const startX = defaultX ?? run.bounds.x;
  const containerOf = collectContainersByPtr(run);
  // An object inside a form XObject moves in the form's own space, which the form's matrix scales away from the page's.
  const shiftAlongPage = (ptr: number, dx: number): void => {
    const container = containerOf.get(ptr) ?? run.containerPtr;
    const form = container ? readMatrix(m, container) : null;
    const det = form ? form[0] * form[3] - form[1] * form[2] : 1;
    if (!form || Math.abs(det) < 1e-9)
      transformObject(m, ptr, 1, 0, 0, 1, dx, 0);
    else
      transformObject(
        m,
        ptr,
        1,
        0,
        0,
        1,
        (form[3] * dx) / det,
        (-form[1] * dx) / det,
      );
  };
  // Letters typed onto a word take that word's face, so it is not drawn half in one font and half in another.
  const wordNeighbourFont = (text: string, beforeIdx?: number): number => {
    const last = newMergedFromTexts.length - 1;
    const touching =
      last >= 0 && /\S$/.test(newMergedFromTexts[last]) && /^\S/.test(text)
        ? newMergedFromPtrs[last]
        : beforeIdx !== undefined &&
            /\S$/.test(text) &&
            /^\S/.test(plan.prevMergedFromTexts[beforeIdx] ?? "")
          ? plan.prevMergedFromPtrs[beforeIdx]
          : 0;
    return touching ? objFontPtr(m, touching) : 0;
  };
  const drawsAll = (font: number, text: string): boolean =>
    charcodesResolveFully(
      m,
      font,
      text.replace(/\s+/g, ""),
      page.pagePtr,
      doc.docPtr,
    );
  const lineStart =
    run.containerPtr === 0
      ? Math.min(
          ...contentIndices(m, page.pagePtr, plan.prevMergedFromPtrs).values(),
        )
      : Infinity;
  // Removals run before the walk below: it re-emits from the surviving
  // pointers, so a deleted object still on the page would be re-counted.
  for (const { ptr, containerPtr } of plan.removePtrs) {
    if (ptr) removeTextObject(m, page, ptr, containerPtr);
  }

  const fallbackFamily = fallbackFamilyFor(run.fontId);
  const newMergedFromPtrs: number[] = [];
  const newMergedFromTexts: string[] = [];
  const newMergedFromBounds: Array<{ x: number; right: number }> = [];
  const newMergedFromCharStarts: number[] = [];
  const insertedPtrs: number[] = [];

  // Font-borrow strategy for inserted text: Embedded CID fonts have no reliable
  // Unicode→CID reverse lookup (ToUnicode CMaps are one-way by design).
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

  // Strategy: walk ops in order.
  let firstX = startX;
  let lastEnd = startX;
  // Bounds stop at the last glyph's ink, so the trailing space must be added back.
  let spacesAtEnd = "";
  const trailingSpaces = (text: string) => /\s*$/.exec(text)?.[0] ?? "";
  function extendLastEnd(right: number, text: string): void {
    if (right < lastEnd) return;
    lastEnd = right;
    spacesAtEnd = trailingSpaces(text);
  }
  // Tc stretches spaces too, matching the gaps emitTextLine draws.
  const whitespaceAdvancePt = (text: string) =>
    text
      ? measureWhitespaceAdvancePt(text, fallbackFamily, run.fontSize) +
        run.charSpacingPt * text.length
      : 0;
  let offset = 0;
  // Tracks the highest sub-run index we've already accounted for in `offset`.
  let processedUpTo = -1;
  function absorbDeletesBefore(idx: number): void {
    for (let i = processedUpTo + 1; i < idx; i++) {
      if (plan.subRunStatus[i] === "all-deleted") {
        const b = plan.prevMergedFromBounds[i];
        if (!b) continue;
        // Subtract the deleted sub-run's ADVANCE, not just its ink width.
        const next = plan.prevMergedFromBounds[i + 1];
        offset -= next && next.x > b.x ? next.x - b.x : b.right - b.x;
      }
    }
    processedUpTo = Math.max(processedUpTo, idx);
  }

  const nextSurvivorOp: Array<PartialEditOp | undefined> = [];
  let upcoming: PartialEditOp | undefined;
  for (let i = plan.ops.length - 1; i >= 0; i--) {
    nextSurvivorOp[i] = upcoming;
    const o = plan.ops[i];
    if ((o.type === "keep" || o.type === "modify") && o.subRunIdx !== undefined)
      upcoming = o;
  }

  // Null when nothing follows the insert or a deletion before it is still pending.
  const followingX = (opIndex: number): number | null => {
    const idx = nextSurvivorOp[opIndex]?.subRunIdx;
    if (idx === undefined) return null;
    for (let i = processedUpTo + 1; i < idx; i++)
      if (plan.subRunStatus[i] === "all-deleted") return null;
    const bounds = plan.prevMergedFromBounds[idx];
    return bounds ? bounds.x + offset : null;
  };

  const insertAnchorX = (
    origBounds: { x: number } | null,
    beforeBounds: { x: number } | null,
    leadingGap: number,
  ): number => {
    if (origBounds) return origBounds.x + offset;
    if (beforeBounds) return beforeBounds.x + offset;
    return lastEnd + leadingGap + whitespaceAdvancePt(spacesAtEnd);
  };

  const offsetAfterInsert = (
    opIndex: number,
    origBounds: { x: number; right: number } | null,
    beforeBounds: { x: number } | null,
    insert: {
      text: string;
      anchorX: number;
      rightEdge: number;
      width: number;
      leadingGap: number;
      hasInk: boolean;
    },
  ): number => {
    const op = plan.ops[opIndex];
    // Anchored (mixed-replacement): delta vs original sub-run width.
    if (origBounds)
      return (
        insert.width -
        (origBounds.right - origBounds.x) -
        whitespaceAdvancePt(
          trailingSpaces(plan.prevMergedFromTexts[op.anchorSubRunIdx!] ?? ""),
        )
      );
    const following = nextSurvivorOp[opIndex];
    if (beforeBounds) {
      // Spaces typed before the next word belong to no object, so add their width.
      const between =
        following && following.subRunIdx === op.anchorBeforeSubRunIdx
          ? plan.nextText.slice(
              op.startBIdx + insert.text.length,
              following.startBIdx,
            )
          : "";
      return insert.width + whitespaceAdvancePt(between);
    }
    // Keep the old gap from the new text's end: ink width drifts a side bearing per key.
    const followX = followingX(opIndex);
    if (followX === null || !insert.hasInk)
      // The ghost-space gap also pushes everything after this insert right.
      return insert.leadingGap + insert.width;
    const gap = Math.max(0, followX - insert.anchorX);
    const trailingAdvance = whitespaceAdvancePt(trailingSpaces(insert.text));
    return insert.rightEdge + trailingAdvance + gap - followX;
  };

  for (const [opIndex, op] of plan.ops.entries()) {
    if (op.type === "keep" && op.subRunIdx !== undefined) {
      absorbDeletesBefore(op.subRunIdx);
      const ptr = plan.prevMergedFromPtrs[op.subRunIdx];
      const text = plan.prevMergedFromTexts[op.subRunIdx];
      const origBounds = plan.prevMergedFromBounds[op.subRunIdx];
      if (Math.abs(offset) > 0.05) {
        try {
          shiftAlongPage(ptr, offset);
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
      extendLastEnd(newRight, text);
    } else if (
      op.type === "modify" &&
      op.subRunIdx !== undefined &&
      op.text !== undefined
    ) {
      // Edit a mixed sub-run's EXISTING object in place: SetText the surviving
      // chars so the embedded font is kept.
      absorbDeletesBefore(op.subRunIdx);
      const ptr = plan.prevMergedFromPtrs[op.subRunIdx];
      const origBounds = plan.prevMergedFromBounds[op.subRunIdx];
      const origWidth = origBounds.right - origBounds.x;
      const modText = op.text;
      // Read the object's own font BEFORE we touch it, so a fallback re-emit
      // can reuse the same embedded font via the charcode path.
      const modFontPtr = objFontPtr(m, ptr);
      const modTags = readTagMarks(m, ptr);
      setObjText(m, ptr, modText);
      if (Math.abs(offset) > 0.05) {
        try {
          shiftAlongPage(ptr, offset);
        } catch {
          /* best-effort */
        }
      }
      const newX = origBounds.x + offset;
      const measuredRight = measureObjRightEdgePt(m, ptr);
      // Validate the in-place SetText the SAME way inserts are validated.
      const modNonWs = modText.replace(/\s+/g, "").length;
      const modMinExpected = modNonWs * run.fontSize * 0.15;
      if (modNonWs > 0 && measuredRight - newX < modMinExpected) {
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
        const reptrs = emitTextLine({
          doc,
          page,
          text: modText,
          x: newX,
          y: emitY,
          fontSize: run.fontSize,
          fill: run.fill,
          ...inkFromRun(run),
          tags: uniformTags(modTags),
          originalFontPtr: modFontPtr,
          originalFontSubset: run.fontSubset,
          charSpacingPt: run.charSpacingPt,
          fallbackFamily,
        });
        let reRight = newX;
        for (const rp of reptrs) {
          const r = measureObjRightEdgePt(m, rp);
          if (r > reRight) reRight = r;
        }
        if (reptrs.length === 0) {
          // Nothing representable emitted - treat like a deletion: the sub-run's
          // width collapses and following sub-runs shift left to close the gap.
          offset -= origWidth;
        } else {
          // Slice modText across the re-emitted ptrs so each stored text is
          // contiguous and the next edit's char-range sanity check still tiles.
          const total = reRight - newX;
          const per = Math.max(1, Math.floor(modText.length / reptrs.length));
          let cur = newX;
          let charCursor = 0;
          for (let i = 0; i < reptrs.length; i++) {
            const isLast = i === reptrs.length - 1;
            const slice = isLast
              ? modText.slice(charCursor)
              : modText.slice(
                  charCursor,
                  toCodePointBoundary(modText, charCursor + per),
                );
            const w = total / reptrs.length;
            newMergedFromPtrs.push(reptrs[i]);
            newMergedFromTexts.push(slice);
            newMergedFromBounds.push({ x: cur, right: cur + w });
            newMergedFromCharStarts.push(op.startBIdx + charCursor);
            insertedPtrs.push(reptrs[i]);
            cur += w;
            charCursor += slice.length;
          }
          extendLastEnd(reRight, modText);
          offset += reRight - newX - origWidth;
        }
      } else {
        const newRight =
          measuredRight > newX ? measuredRight : newX + origWidth;
        newMergedFromPtrs.push(ptr);
        newMergedFromTexts.push(modText);
        newMergedFromBounds.push({ x: newX, right: newRight });
        newMergedFromCharStarts.push(op.startBIdx);
        extendLastEnd(newRight, modText);
        // Subsequent sub-runs shift by the width delta (surviving text is
        // usually narrower than the original).
        offset += newRight - newX - origWidth;
      }
    } else if (op.type === "insert" && op.text) {
      const insertText = op.text;
      const insertTags = sliceTags(
        tags,
        op.startBIdx,
        op.startBIdx + insertText.length,
      );
      const anchorIdx = op.anchorSubRunIdx;
      const beforeIdx = op.anchorBeforeSubRunIdx;
      if (anchorIdx !== undefined) absorbDeletesBefore(anchorIdx);
      else if (beforeIdx !== undefined) absorbDeletesBefore(beforeIdx);
      const origBounds =
        anchorIdx !== undefined ? plan.prevMergedFromBounds[anchorIdx] : null;
      // "prefix of the following word" anchor: emit at that kept sub-run's
      // original left edge so the insert + the glyphs after it read as one.
      const beforeBounds =
        beforeIdx !== undefined ? plan.prevMergedFromBounds[beforeIdx] : null;
      // Anchor priority: * anchorSubRunIdx: emit at the replaced sub-run's x.
      const leadingGap =
        (op.leadingGhostCount ?? 0) * Math.max(1, run.fontSize) * 0.25;
      const anchorX = insertAnchorX(origBounds, beforeBounds, leadingGap);

      // A redrawn piece keeps its own face (bold, italic, a symbol font) for every
      // word it can draw, and a fallback of its style for the rest.
      const ownFont =
        anchorIdx !== undefined
          ? sourceFontOf(doc, plan.prevMergedFromPtrs[anchorIdx])
          : 0;
      // Borrow the font from a survivor that actually contains the inserted
      // chars, so the new glyph reuses that exact embedded font.
      const neighbourFont = ownFont
        ? 0
        : wordNeighbourFont(insertText, beforeIdx);
      const neighbourDraws =
        neighbourFont !== 0 && drawsAll(neighbourFont, insertText);
      const borrowedFontPtr =
        ownFont ||
        (neighbourDraws ? neighbourFont : 0) ||
        (!neighbourFont && allInsertCharsAreSafe
          ? borrowFontForChars(m, plan, insertText)
          : 0);
      const faceFont = ownFont || neighbourFont;
      const insertFallback = faceFont
        ? (deviceFamilyOf(doc, faceFont) ??
          fallbackFamilyFor(`pdf:${faceFont}:${baseFontName(m, faceFont)}`))
        : fallbackFamily;
      const emittedTexts: string[] = [];

      // Try the borrowed source font first; measure the result and fall back to
      // Helvetica if the rendered width is sub-threshold.
      let ptrs = emitTextLine({
        doc,
        page,
        text: insertText,
        x: anchorX,
        y: emitY,
        fontSize: run.fontSize,
        fill: run.fill,
        ...inkFromRun(run),
        tags: insertTags,
        originalFontPtr: borrowedFontPtr,
        originalFontSubset: run.fontSubset,
        charSpacingPt: run.charSpacingPt,
        fallbackFamily: insertFallback,
        outTexts: emittedTexts,
      });
      if (ownFont)
        for (const ptr of ptrs) if (ptr) sourceFontsOf(doc).set(ptr, ownFont);
      let realRightEdge = anchorX;
      for (const ptr of ptrs) {
        const r = measureObjRightEdgePt(m, ptr);
        if (r > realRightEdge) realRightEdge = r;
      }
      let measuredWidth = realRightEdge - anchorX;

      // Heuristic: a working visible glyph is at least ~0.15 * fontSize wide.
      const nonWhitespaceLen = insertText.replace(/\s/g, "").length;
      const minExpected = nonWhitespaceLen * run.fontSize * 0.15;
      // Skip the tofu retry when every returned ptr is already verified.
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
        emittedTexts.length = 0;
        ptrs = emitTextLine({
          doc,
          page,
          text: insertText,
          x: anchorX,
          y: emitY,
          fontSize: run.fontSize,
          fill: run.fill,
          ...inkFromRun(run),
          tags: insertTags,
          originalFontPtr: 0,
          charSpacingPt: run.charSpacingPt,
          fallbackFamily: insertFallback,
          outTexts: emittedTexts,
        });
        realRightEdge = anchorX;
        for (const ptr of ptrs) {
          const r = measureObjRightEdgePt(m, ptr);
          if (r > realRightEdge) realRightEdge = r;
        }
        measuredWidth = realRightEdge - anchorX;
      }
      if (origBounds && ptrs.length > 0) {
        const pieceText = plan.prevMergedFromTexts[anchorIdx!] ?? "";
        const firstInk = objBoundsLR(m, ptrs[0], anchorX).x;
        const drift = anchorX - firstInk;
        // Same first glyph, so the redrawn piece starts where the old one did instead of creeping a side bearing per keystroke.
        if (pieceText[0] === insertText[0] && Math.abs(drift) > 0.05) {
          for (const ptr of ptrs) transformObject(m, ptr, 1, 0, 0, 1, drift, 0);
          realRightEdge += drift;
          measuredWidth = realRightEdge - anchorX;
        }
      }
      // The emitted ink already spans spaces between words; only whitespace past the last glyph is missing.
      measuredWidth += whitespaceAdvancePt(
        nonWhitespaceLen === 0 ? insertText : trailingSpaces(insertText),
      );
      // Map each emitted ptr to the text it actually carries: a word the font
      // could not draw is dropped, so counting words would shift every later one.
      const placed = placeEmittedTexts(insertText, ptrs, emittedTexts);
      if (placed) {
        for (const { ptr, text, start } of placed) {
          const bnds = objBoundsLR(m, ptr, anchorX);
          newMergedFromPtrs.push(ptr);
          newMergedFromTexts.push(text);
          newMergedFromBounds.push({ x: bnds.x, right: bnds.right });
          newMergedFromCharStarts.push(op.startBIdx + start);
          insertedPtrs.push(ptr);
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
            : insertText.slice(
                charCursor,
                toCodePointBoundary(insertText, charCursor + charsPerPtr),
              );
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
      extendLastEnd(realRightEdge, insertText);
      offset += offsetAfterInsert(opIndex, origBounds, beforeBounds, {
        text: insertText,
        anchorX,
        rightEdge: realRightEdge,
        width: measuredWidth,
        leadingGap,
        hasInk: nonWhitespaceLen > 0,
      });
    }
  }

  if (Number.isFinite(lineStart))
    restoreContentOrder(
      m,
      page.pagePtr,
      newMergedFromPtrs.map((ptr, i) => ({ ptr, index: lineStart + i })),
    );
  page.markNeedsGenerate();

  if (newMergedFromBounds.length > 0) {
    firstX = newMergedFromBounds[0].x;
  }

  // newMergedFromCharStarts is populated inline by the ops walk above.

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

/** The pre-edit state of a partial edit's sub-runs that its plan does not hold. */
export interface PartialEditRevertState {
  /** Font each sub-run was drawn in, parallel to `plan.prevMergedFromPtrs`. */
  fonts: number[];
  charStarts: number[];
  baselineY: number;
  fontSubset: boolean;
}

/** Inverse of applyPartialEditPlan once its inserts are gone: maps each removed sub-run to its redrawn object, or null with the page untouched. */
export function revertPartialEditPlan(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  plan: PartialEditPlan,
  prev: PartialEditRevertState,
  tagsOf: (start: number, end: number) => TextTags,
  fallbackFamily: string,
): Map<number, number> | null {
  const m = doc.module;
  const ptrs = plan.prevMergedFromPtrs;
  const removed = new Set(plan.removePtrs.map((r) => r.ptr));
  // A font handle dies with its last object, so reuse it only while a kept object holds it.
  const liveFonts = new Set(
    ptrs.flatMap((ptr, i) => (ptr && !removed.has(ptr) ? [prev.fonts[i]] : [])),
  );
  const replacements = new Map<number, number>();
  const discard = (extra: number[]): null => {
    for (const ptr of [...replacements.values(), ...extra]) {
      removeAndDestroyObject(m, page.pagePtr, ptr);
    }
    return null;
  };
  for (let i = 0; i < ptrs.length; i++) {
    const ptr = ptrs[i];
    if (!removed.has(ptr)) continue;
    const text = plan.prevMergedFromTexts[i] ?? "";
    const bounds = plan.prevMergedFromBounds[i];
    if (!text || !bounds) return discard([]);
    const start = prev.charStarts[i] ?? 0;
    const font = prev.fonts[i] ?? 0;
    const emitted = emitTextLine({
      doc,
      page,
      text,
      x: bounds.x,
      y: prev.baselineY,
      fontSize: run.fontSize,
      fill: run.fill,
      ...inkFromRun(run),
      tags: tagsOf(start, start + text.length),
      originalFontPtr: liveFonts.has(font) ? font : 0,
      originalFontSubset: prev.fontSubset,
      charSpacingPt: run.charSpacingPt,
      fallbackFamily,
    });
    if (emitted.length !== 1 || !emitted[0]) return discard(emitted);
    replacements.set(ptr, emitted[0]);
  }
  for (let i = 0; i < ptrs.length; i++) {
    const live = replacements.get(ptrs[i]) ?? ptrs[i];
    const bounds = plan.prevMergedFromBounds[i];
    if (live && bounds) moveObjectLeftEdgeTo(m, live, bounds.x);
  }
  return replacements;
}

/** Paragraph-aware partial edit. */
export interface ParagraphEditPlan {
  /** Per-slot per-line plan, parallel to `run.paragraphLineSlots`. */
  perSlot: Array<{
    slotIdx: number;
    plan: PartialEditPlan | null;
    prevLine: string;
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

/** Each ptr with the stretch of `text` it carries, found in order; null when the emit's texts cannot all be placed. */
function placeEmittedTexts(
  text: string,
  ptrs: number[],
  emittedTexts: string[],
): Array<{ ptr: number; text: string; start: number }> | null {
  if (emittedTexts.length !== ptrs.length) return null;
  const out: Array<{ ptr: number; text: string; start: number }> = [];
  let cursor = 0;
  for (let i = 0; i < ptrs.length; i++) {
    const carried = emittedTexts[i].trim();
    if (!carried) continue;
    const start = text.indexOf(carried, cursor);
    if (start < 0) return null;
    out.push({ ptr: ptrs[i], text: carried, start });
    cursor = start + carried.length;
  }
  return out;
}

/** The pieces `ptrs` draw of `line`, found in order by their own text; null when one cannot be placed. */
export function piecesFromObjects(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  pagePtr: number,
  ptrs: number[],
  line: string,
): Pick<
  ParagraphLineSlot,
  "mergedFromPtrs" | "mergedFromTexts" | "mergedFromCharStarts"
> | null {
  const texts = readObjTexts(m, pagePtr, ptrs);
  const starts: number[] = [];
  const kept: string[] = [];
  let cursor = 0;
  for (const raw of texts) {
    const text = raw?.trim() ?? "";
    const at = text ? line.indexOf(text, cursor) : -1;
    if (at < 0) return null;
    starts.push(at);
    kept.push(text);
    cursor = at + text.length;
  }
  return {
    mergedFromPtrs: ptrs,
    mergedFromTexts: kept,
    mergedFromCharStarts: starts,
  };
}

/**
 * The font each stretch of `nextLine` came from, when the line held more than one: characters
 * outside the edited middle keep their piece's font, and typed ones take the font of the
 * word they were typed into. Undefined for a single-font line.
 */
export function sourceFontSpans(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  pieces: Pick<
    ParagraphLineSlot,
    "mergedFromPtrs" | "mergedFromTexts" | "mergedFromCharStarts"
  >,
  prevLine: string,
  nextLine: string,
  covers?: (fontPtr: number, text: string) => boolean,
): FontSpan[] | undefined {
  const fontAt = new Array<number>(prevLine.length).fill(0);
  pieces.mergedFromPtrs.forEach((ptr, i) => {
    const start = pieces.mergedFromCharStarts[i];
    const end = start + (pieces.mergedFromTexts[i]?.length ?? 0);
    const font = objFontPtr(m, ptr);
    for (let c = Math.max(0, start); c < Math.min(end, prevLine.length); c++)
      fontAt[c] = font;
  });
  for (let c = 1; c < fontAt.length; c++) fontAt[c] ||= fontAt[c - 1];
  for (let c = fontAt.length - 2; c >= 0; c--) fontAt[c] ||= fontAt[c + 1];
  if (new Set(fontAt.filter(Boolean)).size < 2) return undefined;

  let prefix = 0;
  while (
    prefix < prevLine.length &&
    prefix < nextLine.length &&
    prevLine[prefix] === nextLine[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < prevLine.length - prefix &&
    suffix < nextLine.length - prefix &&
    prevLine[prevLine.length - 1 - suffix] ===
      nextLine[nextLine.length - 1 - suffix]
  )
    suffix++;
  const typedEnd = nextLine.length - suffix;
  const after = fontAt[prevLine.length - suffix] ?? 0;
  const fonts: number[] = [];
  // A new word takes the font after it, else the nearest of the line's fonts that can draw it.
  const typedWordFont = (j: number): number => {
    let before = 0;
    for (let k = j - 1; k >= 0 && !before; k--)
      if (!/\s/.test(nextLine[k])) before = fonts[k];
    const word = /^\S*/.exec(nextLine.slice(j))?.[0] ?? "";
    const candidates = [
      ...new Set([after, before, fonts[j - 1] ?? 0, ...fontAt]),
    ].filter(Boolean);
    return (
      (covers && word && candidates.find((font) => covers(font, word))) ||
      candidates[0] ||
      0
    );
  };
  for (let j = 0; j < nextLine.length; j++) {
    if (j < prefix) fonts.push(fontAt[j]);
    else if (j >= typedEnd)
      fonts.push(fontAt[j - nextLine.length + prevLine.length]);
    else if (j > 0 && !/\s/.test(nextLine[j - 1])) fonts.push(fonts[j - 1]);
    else fonts.push(typedWordFont(j) || 0);
  }
  const spans: FontSpan[] = [];
  for (let j = 0; j < fonts.length; j++) {
    const last = spans[spans.length - 1];
    if (last && (fonts[j] === 0 || fonts[j] === last.fontPtr)) last.end = j + 1;
    else
      spans.push({
        end: j + 1,
        fontPtr: fonts[j],
        fallbackFamily: fallbackFamilyFor(
          `pdf:${fonts[j]}:${baseFontName(m, fonts[j])}`,
        ),
      });
  }
  return spans.length > 1 ? spans : undefined;
}

// /BaseFont keeps the style suffix ("LiberationSans-Bold") that the name table's family drops.
function baseFontName(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  fontPtr: number,
): string {
  if (!fontPtr) return "";
  const len = m.FPDFFont_GetBaseFontName(fontPtr, 0, 0);
  if (len <= 1) return "";
  const buf = scratchPtr(m, SCRATCH.partialFontName, len);
  m.FPDFFont_GetBaseFontName(fontPtr, buf, len);
  return m.pdfium.UTF8ToString(buf).replace(/^[A-Z]{6}\+/, "");
}

/** True when a plan's in-place "modify" op would SetText whitespace its own piece's font cannot encode, which paints „ on a subset with no space glyph. */
export function planModifiesUndrawableWhitespace(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  plan: PartialEditPlan,
  pagePtr: number,
  docPtr: number,
): boolean {
  return plan.ops.some((op) => {
    if (op.type !== "modify" || !op.text || !/\s/.test(op.text)) return false;
    if (op.subRunIdx === undefined) return true;
    const font = objFontPtr(m, plan.prevMergedFromPtrs[op.subRunIdx]);
    const whitespace = [...new Set(op.text.match(/\s/g))].join("");
    return !charcodesResolveFully(m, font, whitespace, pagePtr, docPtr);
  });
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

// Pick the member object whose text shares the most characters with the text
// about to be emitted, and return ITS font handle.
/**
 * The best font handle for `targetText` taken from the OTHER lines of the same
 * paragraph, nearest line first.
 *
 * Only lines whose slot carries the same `fontId` are considered, so a bold or
 * italic sub-run inside the paragraph cannot lend its face to plain body text.
 * Returns 0 when nothing matches, leaving the caller on its normal fallback.
 */
export function siblingFontPtrForText(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  slots: ParagraphLineSlot[],
  selfIndex: number,
  fontId: string,
  targetText: string,
): number {
  const order = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i !== selfIndex && s.fontId === fontId)
    .sort((a, b) => Math.abs(a.i - selfIndex) - Math.abs(b.i - selfIndex));
  for (const { s } of order) {
    const ptr = bestFontPtrForText(
      m,
      s.mergedFromPtrs,
      s.mergedFromTexts,
      targetText,
    );
    if (ptr) return ptr;
  }
  return 0;
}

export function bestFontPtrForText(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  ptrs: number[],
  texts: string[],
  targetText: string,
): number {
  const want = new Set([...targetText].filter((c) => c.trim().length > 0));
  let bestPtr = 0;
  let bestScore = 0;
  for (let i = 0; i < ptrs.length; i++) {
    const ptr = ptrs[i];
    if (!ptr) continue;
    let score = 0;
    for (const c of texts[i] ?? "") if (want.has(c)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestPtr = ptr;
    }
  }
  if (bestPtr) {
    const font = objFontPtr(m, bestPtr);
    if (font) return font;
  }
  for (const ptr of ptrs) {
    const font = objFontPtr(m, ptr);
    if (font) return font;
  }
  return 0;
}

/**
 * The one stretch that differs between `prev` and `next`, by their common
 * prefix and suffix: `start` to `prevEnd` in `prev`, `start` to `nextEnd` in
 * `next`.
 */
export function diffSpan(
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

// Verify the slot char ranges exactly tile `text` with one-char separators
// between visual lines` per slot, a single separator at each `endChar`.
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
  // Slot ranges are code-unit offsets. Only refuse astral text when a slot
  // boundary would cut a pair; the per-line planPartialEdit re-checks the rest.
  const astral = hasAnySurrogate(prevText) || hasAnySurrogate(nextText);
  if (astral) {
    if (!isWellFormedUtf16(prevText) || !isWellFormedUtf16(nextText)) {
      return null;
    }
    for (const s of slots) {
      if (
        !isCodePointBoundary(prevText, s.startChar) ||
        !isCodePointBoundary(prevText, s.endChar)
      ) {
        return null;
      }
    }
  }
  // Per-VISUAL-line text comes from the slot char ranges.
  if (!slotsTileText(slots, prevText)) return null;
  const prevLines = slots.map((s) => prevText.slice(s.startChar, s.endChar));

  // A change in the count of hard breaks ("\n") is a structural line add/remove
  // the slot model can't express; let the line-edit path handle it.
  if (countChar(prevText, "\n") !== countChar(nextText, "\n")) return null;

  // The edit must be confined to a single visual line.
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

  const perSlot: ParagraphEditPlan["perSlot"] = [];

  const prevLine = prevLines[hitSlot];
  const nextLine = nextLines[hitSlot];
  if (prevLine === nextLine) return null;
  // A slot with no sub-run objects can't be partially edited (e.g. an empty
  // line the user just typed the first character into).
  if (hit.mergedFromPtrs.length === 0) {
    perSlot.push({ slotIdx: hitSlot, plan: null, prevLine, nextLine });
  } else {
    // Build a synthetic mini-TextRun view of the slot so the existing
    // planPartialEdit / applyPartialEditPlan code can operate on it.
    const slotView = makeSlotView(run, hit, prevLine);
    const plan = planPartialEdit(slotView, prevLine, nextLine);
    // Per-line LCS couldn't model the change - re-emit just this line
    // rather than failing the whole paragraph to the overlay re-emit.
    perSlot.push({
      slotIdx: hitSlot,
      plan: plan ?? null,
      prevLine,
      nextLine,
    });
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
  /** The edited text's tags. */
  tags: TextTags,
): ParagraphEditApplyResult {
  const m = doc.module;
  // Per-VISUAL-line next text from the plan (slot-range derived).
  const lines = paraPlan.nextLines;
  const newSlots: ParagraphLineSlot[] = run.paragraphLineSlots.map((s) =>
    cloneSlot(s),
  );
  const planBySlot = new Map<
    number,
    { plan: PartialEditPlan | null; prevLine: string; nextLine: string }
  >();
  for (const entry of paraPlan.perSlot) {
    const undrawable =
      entry.plan &&
      planModifiesUndrawableWhitespace(m, entry.plan, page.pagePtr, doc.docPtr);
    planBySlot.set(entry.slotIdx, {
      plan: undrawable ? null : entry.plan,
      prevLine: entry.prevLine,
      nextLine: entry.nextLine,
    });
  }

  const allInsertedPtrs: number[] = [];
  let minX = Infinity;
  let maxRight = -Infinity;

  let lineStart = 0;
  for (let i = 0; i < newSlots.length; i++) {
    const slot = newSlots[i];
    const lineText = lines[i] ?? "";
    const lineTags = sliceTags(tags, lineStart, lineStart + lineText.length);
    lineStart += lineText.length + 1;
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
      // Fresh-emit line: this line couldn't be partially edited.
      const leftX = slot.mergedFromBounds[0]?.x ?? slot.matrixE;
      // Read the font handle BEFORE the objects are removed.
      const reuseFontPtr =
        bestFontPtrForText(
          m,
          slot.mergedFromPtrs,
          slot.mergedFromTexts,
          lineText,
        ) ||
        // A line the user just created with Enter owns no objects yet, so the
        // search above has nothing to score and returns 0 - which re-emits it
        // in Helvetica while the paragraph around it keeps the document's own
        // face. Its SIBLING lines carry exactly the face it should inherit.
        siblingFontPtrForText(m, newSlots, i, slot.fontId, lineText);
      const fontSpans = sourceFontSpans(
        m,
        slot,
        planEntry.prevLine,
        lineText,
        (font, text) =>
          charcodesResolveFully(m, font, text, page.pagePtr, doc.docPtr),
      );
      for (const ptr of slot.mergedFromPtrs) {
        if (!ptr) continue;
        try {
          m.FPDFPage_RemoveObject(page.pagePtr, ptr);
        } catch {
          /* best-effort */
        }
      }
      const fallbackFamily = fallbackFamilyFor(run.fontId);
      if (lineText.length > 0) {
        const emittedTexts: string[] = [];
        const ptrs = emitTextLine({
          outTexts: emittedTexts,
          doc,
          page,
          text: lineText,
          x: leftX,
          y: slot.baselineY,
          fontSize: slot.fontSize,
          fill: run.fill,
          ...inkFromRun(run),
          tags: lineTags,
          originalFontPtr: reuseFontPtr,
          originalFontSubset: slot.fontSubset,
          charSpacingPt: run.charSpacingPt,
          fallbackFamily,
          fontSpans,
        });
        const built = buildSlotMerged(m, ptrs, lineText, leftX, emittedTexts);
        slot.mergedFromPtrs = built.ptrs;
        slot.mergedFromTexts = built.texts;
        slot.mergedFromBounds = built.bounds;
        slot.mergedFromCharStarts = built.charStarts;
        // Only drop to a base-14 identity when the source font wasn't reused;
        // otherwise keep the slot's font so the NEXT edit reuses it again.
        if (reuseFontPtr === 0) {
          slot.fontId = fallbackFontIdFor(fallbackFamily);
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
      lineTags,
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

  // Fix up startChar/endChar across all slots so each slot's range reflects the
  // new joined text.
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

// Build a synthetic TextRun "view" of a paragraph slot so the existing
// planPartialEdit / applyPartialEditPlan can operate on it.
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
