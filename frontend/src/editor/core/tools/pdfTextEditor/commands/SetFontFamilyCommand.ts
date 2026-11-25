import { liftRunToPage } from "@editor/tools/pdfTextEditor/commands/liftFromForm";
import { needsShaping } from "@editor/tools/pdfTextEditor/util/complexShaping";
import { refuseRedrawOfReadOnlyText } from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  cloneParagraphLineSlot,
  type ParagraphLineSlot,
  type TextRun,
} from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  collectContainersByPtr,
  charcodesResolveFully,
  collectMemberPtrs,
  contentIndices,
  droppedCharsOf,
  emitRunLines,
  planLineOrigins,
  recordUndrawableChars,
  removeAndDestroyObject,
  removeMemberPtrs,
  restoreContentOrder,
  warmOnPageAdvances,
  type EmittedLine,
  type FontSpan,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { piecesFromObjects } from "@editor/tools/pdfTextEditor/commands/partialEdit";
import { readRunTags } from "@editor/tools/pdfTextEditor/commands/runTags";
import {
  sliceTags,
  splitLines,
  type TextTags,
} from "@editor/tools/pdfTextEditor/model/TextTags";
import {
  deviceFontEmitCount,
  familyCoverage,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  base14FontId,
  deviceFontId,
  documentFontHandle,
  familyOf,
  isDocumentFontId,
  nearestStandardFont,
  stripSubsetTag,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { readFontName } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import { fallbackFamilyFor } from "@editor/tools/pdfTextEditor/util/fontCapability";
import { fontCompletionFor } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import {
  isScanRun,
  setScanOverride,
  type ScanOverride,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";

interface LineToEmit {
  text: string;
  tags: TextTags;
  /** Where the line starts in the run's text. */
  start: number;
  x: number;
  y: number;
}

// Re-emit a run's text in another family: PDFium has no SetFont accessor.
// Device fonts embed when pre-warmed, else the nearest standard face. A
// document fontId reuses that font of the PDF, the run's own one to restore it.
// Letters the family has no glyph for stay in the font that drew them, and a
// change that would still leave a letter undrawn is not made.
export class SetFontFamilyCommand implements Command {
  readonly type = "set-font-family";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextFamily: string;
  /** Set when the run was scanned text, re-set by redrawing it. */
  private scanPrev: ScanOverride | null = null;
  /** The run as this apply found it, for revert. */
  private prev: RunModelSnapshot | null;
  /** Original on-page member ptrs (re-inserted on revert). */
  private prevMemberPtrs: number[];
  /** Where each original sat in the page's content order, which decides how the text of an object reads beside its neighbours. */
  private prevContentOrder: Array<{ ptr: number; index: number }>;
  /** Every object this command created (removed on revert). */
  private createdPtrs: number[];

  constructor(opts: { pageIndex: number; runId: string; nextFamily: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextFamily = opts.nextFamily;
    this.prev = null;
    this.prevMemberPtrs = [];
    this.prevContentOrder = [];
    this.createdPtrs = [];
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    refuseRedrawOfReadOnlyText(run);
    if (needsShaping(run.text)) return;
    const toDocumentFont = isDocumentFontId(this.nextFamily);
    const documentFont = run.documentFont;
    const restoring =
      toDocumentFont && documentFont?.fontId === this.nextFamily;
    if (toDocumentFont && !documentFontHandle(this.nextFamily)) return;
    const scanPrev = setScanOverride(doc, page, run, (o) => ({
      ...o,
      family: this.nextFamily,
    }));
    if (scanPrev) {
      this.scanPrev = scanPrev;
      return;
    }
    const m = doc.module;
    liftRunToPage(doc, page, run);

    // Read on every apply: redoing an earlier step draws the run in new objects.
    this.prev = snapshotRun(run);
    this.prevMemberPtrs = collectMemberPtrs(run).slice();
    this.prevContentOrder = [
      ...contentIndices(m, page.pagePtr, this.prevMemberPtrs),
    ].map(([ptr, index]) => ({ ptr, index }));

    if (!restoring && !documentFont && isDocumentFontId(run.fontId)) {
      run.documentFont = { fontId: run.fontId, subset: run.fontSubset };
    }

    const emitLines = linesToEmit(run, readRunTags(doc, page, run));
    const lineHeight = lineHeightOf(run);
    // Read while the source objects are still on the page: the kept fonts and their glyph advances come off them.
    const keptFonts = this.keptFontSpans(doc, page, run, emitLines);
    warmOnPageAdvances(m, page.pagePtr);
    // Detach every original object so the page stops painting them.
    removeMemberPtrs(
      m,
      page,
      this.prevMemberPtrs,
      collectContainersByPtr(run),
      run.containerPtr,
    );

    const lineAnchors: number[] = [];
    const memberFs: number[] = [];
    const leaf: number[] = [];
    const created: number[] = [];
    // Emits with the embedded device face are counted, so the font id below
    // can say what actually rendered rather than what was requested.
    const deviceEmitsBefore = deviceFontEmitCount(doc, this.nextFamily);
    let emitted: EmittedLine[] = [];
    const dropped = droppedCharsOf(() => {
      emitted = this.emit(doc, page, run, emitLines, keptFonts);
    });
    for (const line of emitted) {
      memberFs.push(line.y);
      if (line.ptrs.length === 0) {
        lineAnchors.push(0);
        continue;
      }
      lineAnchors.push(line.ptrs[0]);
      leaf.push(...line.ptrs);
      created.push(...line.ptrs);
    }

    // A move to a document font drawn only in fallback faces did not put the run in that font.
    const targetFont = documentFontHandle(this.nextFamily);
    const notInTarget =
      toDocumentFont &&
      !created.some((ptr) => m.FPDFTextObj_GetFont(ptr) === targetFont);
    if (created.length === 0 || notInTarget || losesLetters(dropped)) {
      // Nothing usable emitted (e.g. all-whitespace dropped), or a letter went undrawn - restore and bail.
      for (const ptr of created) removeAndDestroyObject(m, page.pagePtr, ptr);
      this.reinsertOriginals(m, page);
      restoreRun(run, this.prev);
      // Neutralise the command: it still lands in history, and a revert with
      // `prev` set would reinsert the originals a SECOND time.
      this.prev = null;
      return;
    }

    // Only characters that draw nothing get this far, and a save still lists them as dropped.
    recordUndrawableChars(dropped.join(""));
    this.createdPtrs = created;
    run.pdfiumObjPtr = lineAnchors.find((p) => p) ?? leaf[0];
    // `device:` marks glyphs from an embedded device font; a substituted run
    // keeps `base14:`, so nothing keying off that prefix changes meaning.
    const embedded =
      deviceFontEmitCount(doc, this.nextFamily) > deviceEmitsBefore;
    if (restoring) {
      run.fontId = this.nextFamily;
      run.fontSubset = documentFont?.subset ?? false;
      run.documentFont = null;
    } else if (toDocumentFont) {
      run.fontId = this.nextFamily;
      run.fontSubset = isSubsetFont(m, targetFont);
    } else {
      run.fontId = embedded
        ? deviceFontId(this.nextFamily)
        : base14FontId(this.nextFamily);
      run.fontSubset = false;
    }
    // Reset ALL model bookkeeping to the freshly-emitted objects so later
    // commands act on the live objects, not the removed originals.
    run.mergedFromPtrs = [];
    run.mergedFromTexts = [];
    run.mergedFromBounds = [];
    run.mergedFromCharStarts = [];
    run.paragraphLineSlots = [];
    // Track every per-word leaf so later recolour/resize/move hit all words,
    // not just the anchor. Line height stays paragraph-only (>1 line).
    run.paragraphMemberPtrs = lineAnchors;
    run.paragraphMemberContainers = lineAnchors.map(() => 0);
    run.paragraphMemberFs = memberFs;
    run.paragraphLeafPtrs = leaf;
    run.paragraphLeafContainers = leaf.map(() => 0);
    if (emitLines.length > 1) {
      run.paragraphLineHeight = lineHeight;
    }
    run.containerPtr = 0;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  wouldLoseText(doc: EditorDocument): boolean {
    return this.refusal(doc) === "losesText";
  }

  /**
   * Why applying this would be refused, or null when it would apply: a letter
   * of the run left undrawn, or a restore the document font cannot draw (a
   * Type 3 font with no way to encode new text, say). Found by drawing the run
   * beside itself and taking that back, so the answer is the emit's own and
   * the page is left as it was.
   */
  refusal(doc: EditorDocument): "losesText" | "notRestored" | null {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || isScanRun(run) || run.scanEdit) return null;
    const restoring = isDocumentFontId(this.nextFamily);
    if (restoring && !documentFontHandle(this.nextFamily)) return null;
    const emitLines = linesToEmit(run, readRunTags(doc, page, run));
    const keptFonts = this.keptFontSpans(doc, page, run, emitLines);
    warmOnPageAdvances(doc.module, page.pagePtr);
    let emitted: EmittedLine[] = [];
    const dropped = droppedCharsOf(() => {
      emitted = this.emit(doc, page, run, emitLines, keptFonts);
    });
    const restoreFont = documentFontHandle(this.nextFamily);
    let drawsRestoreFont = false;
    for (const line of emitted)
      for (const ptr of line.ptrs) {
        if (doc.module.FPDFTextObj_GetFont(ptr) === restoreFont)
          drawsRestoreFont = true;
        removeAndDestroyObject(doc.module, page.pagePtr, ptr);
      }
    if (losesLetters(dropped)) return "losesText";
    return restoring && !drawsRestoreFont ? "notRestored" : null;
  }

  /**
   * How much of the run's visible text the next font has glyphs for: the rest
   * is drawn in the closest font that has them, and none means the change
   * would not put the run in that font at all.
   */
  coverage(doc: EditorDocument): "all" | "some" | "none" {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || isScanRun(run) || run.scanEdit) return "all";
    const draws = this.nextFontDraws(doc, page);
    if (!draws) return "all";
    const visible = [...run.text].filter(
      (ch) => !/\s/.test(ch) && !DRAWS_NOTHING.test(ch),
    );
    const drawn = visible.filter(draws).length;
    if (drawn === visible.length) return "all";
    return drawn === 0 ? "none" : "some";
  }

  /** Whether the next font has a glyph for a character; null when that cannot be known. */
  private nextFontDraws(
    doc: EditorDocument,
    page: Page,
  ): ((ch: string) => boolean) | null {
    const target = documentFontHandle(this.nextFamily);
    if (!target) return familyDraws(doc, this.nextFamily);
    return (ch) =>
      charcodesResolveFully(doc.module, target, ch, page.pagePtr, doc.docPtr);
  }

  private emit(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
    lines: readonly LineToEmit[],
    keptFonts: ReadonlyArray<readonly FontSpan[] | undefined> | undefined,
  ): EmittedLine[] {
    // Only a document font is reused for the run; either way `keptFonts` holds the letters that stay where they are.
    const targetFont = documentFontHandle(this.nextFamily);
    return emitRunLines({
      doc,
      page,
      run,
      lines: lines.map(({ text, tags }) => ({ text, tags })),
      origins: lines.map((line) => ({ x: line.x, y: line.y })),
      originalFontPtr: targetFont,
      originalFontSubset: !targetFont
        ? run.fontSubset
        : run.documentFont?.fontId === this.nextFamily
          ? run.documentFont.subset
          : isSubsetFont(doc.module, targetFont),
      fallbackFamily: targetFont
        ? fallbackFamilyFor(this.nextFamily)
        : this.nextFamily,
      fontSpansByLine: keptFonts,
    });
  }

  /**
   * Per line, the stretches the next font has no glyph for, each with the font
   * its letters are drawn in. Undefined when the next font draws every letter.
   * A move to a document font keeps only letters still in a font of the
   * document: one the editor drew, in the family being left or a stand-in for
   * it, goes with the rest of the run.
   */
  private keptFontSpans(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
    lines: readonly LineToEmit[],
  ): Array<FontSpan[] | undefined> | undefined {
    const m = doc.module;
    const restoreFont = documentFontHandle(this.nextFamily);
    const draws = this.nextFontDraws(doc, page);
    if (!draws) return undefined;
    const lacks = (ch: string) => !/\s/.test(ch) && !draws(ch);
    if (![...run.text].some(lacks)) return undefined;
    const fontAt = sourceFontAt(m, page.pagePtr, run);
    const leaving = familyOf(run.fontId);
    // A run still in a document font was drawn by the PDF, so a font named like it is that face, not a stand-in.
    const drawnByEditor = (font: number) =>
      !!doc.ownedFontAt(font) ||
      (!isDocumentFontId(run.fontId) &&
        [leaving, nearestStandardFont(leaving)].includes(
          stripSubsetTag(readFontName(m, font) ?? ""),
        ));
    // A face completed from its real font draws a missing letter closer than the face the run is leaving.
    const completed =
      run.documentFont?.fontId !== this.nextFamily &&
      !!fontCompletionFor(this.nextFamily);
    const keeps = (font: number) =>
      !restoreFont ||
      (!completed && font !== restoreFont && !drawnByEditor(font));
    const fallbackFamily = restoreFont
      ? fallbackFamilyFor(this.nextFamily)
      : this.nextFamily;
    return lines.map((line) => {
      const kept = new Array<number>(line.text.length).fill(0);
      for (const stretch of stretchesLacking(line.text, lacks)) {
        if (NEEDS_SHAPING.test(line.text.slice(stretch.start, stretch.end)))
          continue;
        for (let c = stretch.start; c < stretch.end; c++) {
          const font = fontAt[line.start + c] ?? 0;
          if (keeps(font)) kept[c] = font;
        }
      }
      return spansOf(line.text, kept, fallbackFamily);
    });
  }

  revert(doc: EditorDocument): void {
    if (this.scanPrev) {
      const page = doc.page(this.pageIndex);
      const run = page.findRun(this.runId);
      const prev = this.scanPrev;
      if (run) setScanOverride(doc, page, run, () => prev);
      this.scanPrev = null;
      return;
    }
    if (!this.prev) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;

    for (const ptr of this.createdPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
    this.createdPtrs = [];
    this.reinsertOriginals(m, page);
    restoreRun(run, this.prev);
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  private reinsertOriginals(m: WrappedPdfiumModule, page: Page): void {
    for (const ptr of this.prevMemberPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_InsertObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
    restoreContentOrder(m, page.pagePtr, this.prevContentOrder);
  }
}

/** Whether an emit in `family` draws a character in that family's own face; null when that cannot be known. */
function familyDraws(
  doc: EditorDocument,
  family: string,
): ((ch: string) => boolean) | null {
  const covers = familyCoverage(doc, family);
  return covers && ((ch) => covers(ch.codePointAt(0)!));
}

/**
 * Text whose look depends on shaping: combining marks, joiners, the joining
 * scripts and conjoining jamo. Redrawn letter by letter in its own font it
 * would lose its ligatures and mark positions, so it is never split off.
 */
const NEEDS_SHAPING =
  /\p{M}|\u200c|\u200d|[\u1100-\u11ff]|\p{Script=Arabic}|\p{Script=Syriac}|\p{Script=Nko}|\p{Script=Mandaic}|\p{Script=Mongolian}|\p{Script=Phags_Pa}|\p{Script=Adlam}/u;
export const ATTACHES_TO_PREVIOUS = /\p{M}|\u200c|\u200d/u;
/** Format and control characters draw nothing, so losing one loses no letter. */
const DRAWS_NOTHING = /[\p{Cf}\p{Cc}]/u;

export function isSubsetFont(m: WrappedPdfiumModule, font: number): boolean {
  return /^[A-Z]{6}\+/.test(readFontName(m, font) ?? "");
}

export function losesLetters(dropped: readonly string[]): boolean {
  return dropped.some((ch) => !DRAWS_NOTHING.test(ch));
}

function lineHeightOf(run: TextRun): number {
  return run.paragraphLineHeight > 0
    ? run.paragraphLineHeight
    : run.fontSize * 1.2;
}

// Prefer per-line SLOT ranges: run.text joins SOFT-wrapped lines with
// separators a \n split can't see. Baseline stepping for the fallback case
// comes from planLineOrigins so it cannot drift from EditTextCommand's.
function linesToEmit(run: TextRun, tags: TextTags): LineToEmit[] {
  const slots = run.paragraphLineSlots;
  if (slots.length > 0)
    return slots.map((s) => {
      const start = Math.max(0, s.startChar);
      const text = run.text
        .slice(start, Math.min(run.text.length, s.endChar))
        .replace(/[\r\n]+$/, "");
      return {
        text,
        tags: sliceTags(tags, start, start + text.length),
        start,
        x: s.matrixE,
        y: s.baselineY,
      };
    });
  const lines = splitLines(run.text, tags);
  const origins = planLineOrigins(run, lines.length, lineHeightOf(run));
  let cursor = 0;
  return lines.map((line, i) => {
    const start = run.text.indexOf(line.text, cursor);
    cursor = start + line.text.length;
    return { ...line, ...origins[i], start };
  });
}

/** The font handle drawing each code unit of the run's text, 0 where none is known. */
function sourceFontAt(
  m: WrappedPdfiumModule,
  pagePtr: number,
  run: TextRun,
): number[] {
  const fontAt = new Array<number>(run.text.length).fill(0);
  const mark = (
    pieces: Pick<
      ParagraphLineSlot,
      "mergedFromPtrs" | "mergedFromTexts" | "mergedFromCharStarts"
    >,
    offset: number,
  ) =>
    pieces.mergedFromPtrs.forEach((ptr, i) => {
      const start = offset + (pieces.mergedFromCharStarts[i] ?? 0);
      const end = start + (pieces.mergedFromTexts[i]?.length ?? 0);
      const font = ptr ? m.FPDFTextObj_GetFont(ptr) : 0;
      for (let c = Math.max(0, start); c < Math.min(end, fontAt.length); c++)
        fontAt[c] = font;
    });
  if (run.paragraphLineSlots.length > 0) {
    for (const slot of run.paragraphLineSlots) mark(slot, slot.startChar);
  } else {
    const pieces =
      run.mergedFromPtrs.length > 0
        ? run
        : piecesFromObjects(m, pagePtr, collectMemberPtrs(run), run.text);
    if (pieces) mark(pieces, 0);
  }
  for (let c = 1; c < fontAt.length; c++) fontAt[c] ||= fontAt[c - 1];
  for (let c = fontAt.length - 2; c >= 0; c--) fontAt[c] ||= fontAt[c + 1];
  if (fontAt[0] === 0 && run.pdfiumObjPtr)
    fontAt.fill(m.FPDFTextObj_GetFont(run.pdfiumObjPtr));
  return fontAt;
}

/** Each unbroken stretch of `text` holding a character `lacks` is true of, with the marks attached to it. */
function stretchesLacking(
  text: string,
  lacks: (ch: string) => boolean,
): Array<{ start: number; end: number }> {
  const stretches: Array<{ start: number; end: number }> = [];
  let open: { start: number; end: number } | null = null;
  let at = 0;
  for (const ch of text) {
    const end = at + ch.length;
    if (lacks(ch) || (open && ATTACHES_TO_PREVIOUS.test(ch))) {
      if (open) open.end = end;
      else stretches.push((open = { start: at, end }));
    } else {
      open = null;
    }
    at = end;
  }
  return stretches;
}

/** `kept` as font spans: 0 is the next font, and a space stays with the letter before it. */
function spansOf(
  text: string,
  kept: readonly number[],
  family: string,
): FontSpan[] | undefined {
  const spans: FontSpan[] = [];
  for (let c = 0; c < text.length; c++) {
    const last = spans[spans.length - 1];
    if (last && (/\s/.test(text[c]) || kept[c] === last.fontPtr))
      last.end = c + 1;
    else spans.push({ end: c + 1, fontPtr: kept[c], fallbackFamily: family });
  }
  return spans.some((span) => span.fontPtr !== 0) ? spans : undefined;
}

interface RunModelSnapshot {
  text: string;
  fontId: string;
  fontSubset: boolean;
  documentFont: TextRun["documentFont"];
  fill: { r: number; g: number; b: number; a: number };
  pdfiumObjPtr: number;
  containerPtr: number;
  mergedFromPtrs: number[];
  mergedFromTexts: string[];
  mergedFromBounds: Array<{ x: number; right: number }>;
  mergedFromCharStarts: number[];
  paragraphMemberPtrs: number[];
  paragraphMemberContainers: number[];
  paragraphMemberFs: number[];
  paragraphLeafPtrs: number[];
  paragraphLeafContainers: number[];
  paragraphLineSlots: ParagraphLineSlot[];
  paragraphLineHeight: number;
}

function snapshotRun(run: TextRun): RunModelSnapshot {
  return {
    text: run.text,
    fontId: run.fontId,
    fontSubset: run.fontSubset,
    documentFont: run.documentFont,
    fill: { ...run.fill },
    pdfiumObjPtr: run.pdfiumObjPtr,
    containerPtr: run.containerPtr,
    mergedFromPtrs: [...run.mergedFromPtrs],
    mergedFromTexts: [...run.mergedFromTexts],
    mergedFromBounds: run.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...run.mergedFromCharStarts],
    paragraphMemberPtrs: [...run.paragraphMemberPtrs],
    paragraphMemberContainers: [...run.paragraphMemberContainers],
    paragraphMemberFs: [...run.paragraphMemberFs],
    paragraphLeafPtrs: [...run.paragraphLeafPtrs],
    paragraphLeafContainers: [...run.paragraphLeafContainers],
    paragraphLineSlots: run.paragraphLineSlots.map(cloneParagraphLineSlot),
    paragraphLineHeight: run.paragraphLineHeight,
  };
}

function restoreRun(run: TextRun, snap: RunModelSnapshot): void {
  run.text = snap.text;
  run.fontId = snap.fontId;
  run.fontSubset = snap.fontSubset;
  run.documentFont = snap.documentFont;
  run.fill = { ...snap.fill };
  run.pdfiumObjPtr = snap.pdfiumObjPtr;
  run.containerPtr = snap.containerPtr;
  run.mergedFromPtrs = [...snap.mergedFromPtrs];
  run.mergedFromTexts = [...snap.mergedFromTexts];
  run.mergedFromBounds = snap.mergedFromBounds.map((b) => ({ ...b }));
  run.mergedFromCharStarts = [...snap.mergedFromCharStarts];
  run.paragraphMemberPtrs = [...snap.paragraphMemberPtrs];
  run.paragraphMemberContainers = [...snap.paragraphMemberContainers];
  run.paragraphMemberFs = [...snap.paragraphMemberFs];
  run.paragraphLeafPtrs = [...snap.paragraphLeafPtrs];
  run.paragraphLeafContainers = [...snap.paragraphLeafContainers];
  run.paragraphLineSlots = snap.paragraphLineSlots.map(cloneParagraphLineSlot);
  run.paragraphLineHeight = snap.paragraphLineHeight;
}
