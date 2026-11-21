import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Affine } from "@editor/tools/pdfTextEditor/types";
import { startsWithListMarker } from "@editor/tools/pdfTextEditor/util/listText";
import { softStartsOf } from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { liftRunToPage } from "@editor/tools/pdfTextEditor/commands/liftFromForm";
import { refuseRedrawOfReadOnlyText } from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import {
  collectMemberPtrs,
  measureObjBoundsPt,
  rotationFromMatrix,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";

export type TextAlign = "left" | "center" | "right";

export interface AlignFrame {
  left: number;
  right: number;
}

// Underline thickness and drop below the baseline, as fractions of the type size.
const UNDERLINE_THICKNESS_EM = 0.06;
const UNDERLINE_DROP_EM = 0.12;
const MIN_SHIFT_PT = 0.05;
const MOVE_MATCH_PT = 0.5;

interface LineBox {
  ptrs: number[];
  slot: number | null;
  left: number;
  right: number;
  baseline: number;
}

/** True for editable text sitting upright on an unrotated page: alignment and underlines are laid out along the page's x axis. */
export function formatsUpright(
  run: { locked?: boolean; textReadOnly?: boolean; matrix: Affine },
  pageRotate: number,
): boolean {
  return (
    !run.locked &&
    !run.textReadOnly &&
    pageRotate === 0 &&
    !rotationFromMatrix(run.matrix)
  );
}

export function canFormatParagraph(page: Page, run: TextRun): boolean {
  return run.containerPtr === 0 && formatsUpright(run, page.display.rotate);
}

function lineBoxes(m: WrappedPdfiumModule, run: TextRun): LineBox[] {
  const lines =
    run.paragraphLineSlots.length >= 2
      ? run.paragraphLineSlots.map((slot, i) => ({
          ptrs: slot.mergedFromPtrs,
          slot: i as number | null,
          baseline: slot.baselineY,
        }))
      : [
          {
            ptrs: collectMemberPtrs(run),
            slot: null,
            baseline: run.paragraphLineSlots[0]?.baselineY ?? run.matrix.f,
          },
        ];
  return lines.flatMap((line) => {
    const box = measureObjBoundsPt(m, line.ptrs);
    return box ? [{ ...line, left: box.left, right: box.right }] : [];
  });
}

function startsListItem(run: TextRun, line: LineBox): boolean {
  if (run.listIndent <= 0) return false;
  const slot = line.slot === null ? null : run.paragraphLineSlots[line.slot];
  const text = slot ? run.text.slice(Math.max(0, slot.startChar)) : run.text;
  return startsWithListMarker(text);
}

// The measure the run's lines align within: the box the user set, else the
// paragraph's widest line, else for a single line the page between margins
// as wide as the line's own left one, so a title centres on the page.
function frameFor(page: Page, run: TextRun, lines: LineBox[]): AlignFrame {
  const left = Math.min(...lines.map((l) => l.left));
  const right = Math.max(...lines.map((l) => l.right));
  if (run.wrapWidthPt) return { left, right: left + run.wrapWidthPt };
  if (lines.length >= 2) return { left, right };
  const pageLeft = page.display.cropLeft;
  const pageRight = page.display.cropRight;
  const margin = Math.max(0, Math.min(left - pageLeft, pageRight - right));
  return { left: pageLeft + margin, right: pageRight - margin };
}

function targetLeft(line: LineBox, align: TextAlign, frame: AlignFrame) {
  const width = line.right - line.left;
  if (align === "center") return (frame.left + frame.right - width) / 2;
  if (align === "right") return frame.right - width;
  return frame.left;
}

function signatureOf(m: WrappedPdfiumModule, run: TextRun): string {
  const lines = lineBoxes(m, run)
    .map(
      (l) =>
        `${l.left.toFixed(2)},${l.right.toFixed(2)},${l.baseline.toFixed(2)}`,
    )
    .join(";");
  const { r, g, b, a } = run.fill;
  return `${run.align ?? ""}|${run.listIndent}|${run.underline ? "u" : ""}|${r},${g},${b},${a}|${run.text}|${lines}`;
}

/** Set how a run's lines align and whether they are underlined; the page's format sync then lays them out. */
export class SetParagraphFormatCommand implements Command {
  readonly type = "set-paragraph-format";
  private readonly pageIndex: number;
  private readonly runIds: string[];
  private readonly align: TextAlign | undefined;
  private readonly underline: boolean | undefined;
  private readonly listIndent: number | undefined;
  private prev: Array<{
    runId: string;
    align: TextAlign | null;
    alignFrame: AlignFrame | null;
    underline: boolean;
    listIndent: number;
  }> = [];

  constructor(opts: {
    pageIndex: number;
    runIds: string[];
    align?: TextAlign;
    underline?: boolean;
    /** How far a list item's wrapped lines sit in from its marker, in points; 0 for none. */
    listIndent?: number;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runIds = opts.runIds;
    this.align = opts.align;
    this.underline = opts.underline;
    this.listIndent = opts.listIndent;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    this.prev = [];
    for (const runId of this.runIds) {
      const run = page.findRun(runId);
      if (!run) continue;
      refuseRedrawOfReadOnlyText(run);
      liftRunToPage(doc, page, run);
      if (!canFormatParagraph(page, run)) continue;
      this.prev.push({
        runId,
        align: run.align,
        alignFrame: run.alignFrame,
        underline: run.underline,
        listIndent: run.listIndent,
      });
      if (this.listIndent !== undefined) {
        // Lines a list indented need laying back flush once it goes.
        if (this.listIndent === 0 && run.listIndent > 0 && !run.align)
          run.align = "left";
        run.listIndent = this.listIndent;
      }
      if (this.align !== undefined) {
        if (!run.alignFrame) {
          const lines = lineBoxes(doc.module, run);
          if (lines.length > 0) run.alignFrame = frameFor(page, run, lines);
        }
        run.align = this.align;
      }
      if (this.underline !== undefined) run.underline = this.underline;
      page.paragraphFormats.add(runId);
    }
    if (this.prev.length > 0) page.markDirty();
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    for (const prev of this.prev) {
      const run = page.findRun(prev.runId);
      if (!run) continue;
      run.align = prev.align;
      run.alignFrame = prev.alignFrame;
      run.underline = prev.underline;
      run.listIndent = prev.listIndent;
    }
    if (this.prev.length > 0) page.markDirty();
  }
}

// Recorded by run and line, not by object: an undo or redo of the typing
// around it can redraw the line in new objects, so the move back finds the
// line's objects as they are then.
interface LineShift {
  runId: string;
  slot: number | null;
  dx: number;
}

/**
 * Lays out every formatted run on one page to match its format: lines moved
 * to their alignment, underlines redrawn under the lines where they now are.
 * The store attaches it to the step whose change put a run out of format, so
 * a typed character and the re-centring it caused undo together.
 */
export class SyncParagraphFormatCommand implements Command {
  readonly type = "sync-paragraph-format";
  readonly followsPrevious = true;
  private readonly pageIndex: number;
  private readonly followsKey: string | null;
  private shifts: LineShift[] = [];
  private removed: Array<{ runId: string; ptrs: number[] }> = [];
  private added: Array<{ runId: string; ptrs: number[] }> = [];
  private prevSignatures = new Map<string, string>();
  private prevLayouts = new Map<string, { text: string; lefts: number[] }>();
  private movedFrames: Array<{ runId: string; frame: AlignFrame }> = [];

  constructor(opts: { pageIndex: number; followsKey: string | null }) {
    this.pageIndex = opts.pageIndex;
    this.followsKey = opts.followsKey;
  }

  /** True when some formatted run on the page no longer matches its format. */
  static needed(doc: EditorDocument, pageIndex: number): boolean {
    const page = doc.page(pageIndex);
    for (const runId of page.paragraphFormats) {
      const run = page.findRun(runId);
      if (!run) {
        if (page.underlines.has(runId)) return true;
        continue;
      }
      if (page.formatSignatures.get(runId) !== signatureOf(doc.module, run))
        return true;
    }
    return false;
  }

  apply(doc: EditorDocument): void {
    this.layOut(doc, true);
  }

  relayoutAfterGroup(doc: EditorDocument): void {
    this.layOut(doc, false);
  }

  // `followMoves` reads lines shifted together as the run having been moved;
  // after a group's undo or redo they shifted because their objects were
  // redrawn, and are laid out where their format puts them.
  private layOut(doc: EditorDocument, followMoves: boolean): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    this.shifts = [];
    this.removed = [];
    this.added = [];
    this.prevSignatures = new Map(page.formatSignatures);
    this.prevLayouts = new Map(page.formatLayouts);
    this.movedFrames = [];
    for (const runId of [...page.paragraphFormats]) {
      const run = page.findRun(runId);
      if (run && page.formatSignatures.get(runId) === signatureOf(m, run))
        continue;
      this.dropUnderline(doc, page, runId);
      if (!run || !canFormatParagraph(page, run)) continue;
      if (followMoves) this.followMove(page, run, lineBoxes(m, run));
      this.layoutLines(doc, page, run);
      if (run.underline) this.drawUnderline(doc, page, run);
      page.formatSignatures.set(runId, signatureOf(m, run));
      page.formatLayouts.set(runId, {
        text: run.text,
        lefts: lineBoxes(m, run).map((line) => line.left),
      });
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    for (const shift of [...this.shifts].reverse())
      moveLine(doc, page, shift.runId, shift.slot, -shift.dx);
    this.revertBesideGroup(doc);
  }

  revertBesideGroup(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    for (const { runId, ptrs } of this.added) {
      for (const ptr of ptrs) m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      page.underlines.delete(runId);
    }
    for (const { runId, ptrs } of this.removed) {
      for (const ptr of ptrs) m.FPDFPage_InsertObject(page.pagePtr, ptr);
      page.underlines.set(runId, ptrs);
    }
    page.formatSignatures.clear();
    for (const [id, sig] of this.prevSignatures)
      page.formatSignatures.set(id, sig);
    page.formatLayouts.clear();
    for (const [id, layout] of this.prevLayouts)
      page.formatLayouts.set(id, layout);
    for (const { runId, frame } of this.movedFrames) {
      const run = page.findRun(runId);
      if (run) run.alignFrame = frame;
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  coalesceKey(): string | null {
    return this.followsKey;
  }

  // Every line shifted by one offset with the text unchanged is the run being
  // moved: the measure it aligns in goes with it, so the move stands.
  private followMove(page: Page, run: TextRun, lines: LineBox[]): void {
    const before = page.formatLayouts.get(run.id);
    const frame = run.alignFrame;
    if (!before || !frame || before.text !== run.text) return;
    if (lines.length === 0 || lines.length !== before.lefts.length) return;
    const dx = lines[0].left - before.lefts[0];
    if (Math.abs(dx) < MIN_SHIFT_PT) return;
    const uniform = lines.every(
      (line, i) => Math.abs(line.left - before.lefts[i] - dx) < MOVE_MATCH_PT,
    );
    if (!uniform) return;
    this.movedFrames.push({ runId: run.id, frame });
    run.alignFrame = { left: frame.left + dx, right: frame.right + dx };
  }

  // Moves each line to its alignment within the frame; a list item left
  // aligned also sets its wrapped lines in past the marker.
  private layoutLines(doc: EditorDocument, page: Page, run: TextRun): void {
    const align = run.align ?? "left";
    const hanging = align === "left" ? run.listIndent : 0;
    if (!run.align && !hanging) return;
    const lines = lineBoxes(doc.module, run);
    if (lines.length === 0) return;
    const frame = run.alignFrame ?? {
      left: lines[0].left,
      right: lines[0].right,
    };
    const soft = softStartsOf(run);
    for (const line of lines) {
      const indent =
        line.slot !== null && line.slot > 0 && soft[line.slot] ? hanging : 0;
      const dx = targetLeft(line, align, frame) + indent - line.left;
      if (Math.abs(dx) < MIN_SHIFT_PT) continue;
      moveLine(doc, page, run.id, line.slot, dx);
      this.shifts.push({ runId: run.id, slot: line.slot, dx });
    }
  }

  private drawUnderline(doc: EditorDocument, page: Page, run: TextRun): void {
    const m = doc.module;
    const thickness = Math.max(0.5, run.fontSize * UNDERLINE_THICKNESS_EM);
    const ptrs: number[] = [];
    for (const line of lineBoxes(m, run)) {
      const left = line.left + (startsListItem(run, line) ? run.listIndent : 0);
      if (left >= line.right) continue;
      const ptr = m.FPDFPageObj_CreateNewRect(
        left,
        line.baseline - run.fontSize * UNDERLINE_DROP_EM - thickness,
        line.right - left,
        thickness,
      );
      if (!ptr) continue;
      const { r, g, b, a } = run.fill;
      m.FPDFPageObj_SetFillColor(ptr, r, g, b, a);
      m.FPDFPath_SetDrawMode(ptr, 2, false);
      m.FPDFPage_InsertObject(page.pagePtr, ptr);
      ptrs.push(ptr);
    }
    page.underlines.set(run.id, ptrs);
    this.added.push({ runId: run.id, ptrs });
  }

  private dropUnderline(doc: EditorDocument, page: Page, runId: string): void {
    const ptrs = page.underlines.get(runId);
    if (!ptrs) return;
    for (const ptr of ptrs) doc.module.FPDFPage_RemoveObject(page.pagePtr, ptr);
    page.underlines.delete(runId);
    this.removed.push({ runId, ptrs });
  }
}

// A whole single-line run moves as a run, so a scanned one is redrawn and its
// model follows; a paragraph line moves its own objects.
function moveLine(
  doc: EditorDocument,
  page: Page,
  runId: string,
  slot: number | null,
  dx: number,
): void {
  const run = page.findRun(runId);
  if (!run) return;
  if (slot === null) {
    new MoveTextRunCommand({ pageIndex: page.index, runId, dx, dy: 0 }).apply(
      doc,
    );
    return;
  }
  const line = run.paragraphLineSlots[slot];
  if (line) shiftLine(doc.module, run, slot, line.mergedFromPtrs, dx);
}

function shiftLine(
  m: WrappedPdfiumModule,
  run: TextRun,
  slotIndex: number | null,
  ptrs: number[],
  dx: number,
): void {
  for (const ptr of new Set(ptrs)) {
    if (ptr) transformObject(m, ptr, 1, 0, 0, 1, dx, 0);
  }
  const slot = slotIndex === null ? null : run.paragraphLineSlots[slotIndex];
  if (slot) {
    slot.matrixE += dx;
    slot.mergedFromBounds = slot.mergedFromBounds.map((b) => ({
      x: b.x + dx,
      right: b.right + dx,
    }));
  }
  const box = measureObjBoundsPt(m, collectMemberPtrs(run));
  if (box) {
    run.bounds = {
      ...run.bounds,
      x: box.left,
      width: Math.max(0, box.right - box.left),
    };
  }
  run.dirty = true;
}

export type TextStyleName = "title" | "heading1" | "heading2" | "body";

/** The size, weight and structure element each text style gives a run. */
export const TEXT_STYLES: Record<
  TextStyleName,
  { size: number; bold: boolean; tag: "Title" | "H1" | "H2" | "P" }
> = {
  title: { size: 26, bold: true, tag: "Title" },
  heading1: { size: 18, bold: true, tag: "H1" },
  heading2: { size: 14, bold: true, tag: "H2" },
  body: { size: 11, bold: false, tag: "P" },
};
