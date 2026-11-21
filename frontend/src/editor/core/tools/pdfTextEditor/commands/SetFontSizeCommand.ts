import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { SetTextOutlineCommand } from "@editor/tools/pdfTextEditor/commands/SetTextOutlineCommand";
import {
  fauxBoldWidth,
  isFauxBold,
} from "@editor/tools/pdfTextEditor/util/fauxBold";
import { liftRunToPage } from "@editor/tools/pdfTextEditor/commands/liftFromForm";
import { refuseRedrawOfReadOnlyText } from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";
import {
  scanDrawnSize,
  setScanOverride,
  type ScanOverride,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";

/** Scale a text run so its effective on-page size matches `nextSize`. */
export class SetFontSizeCommand implements Command {
  private outline: SetTextOutlineCommand | null = null;
  readonly type = "set-font-size";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextSize: number;
  private prevSize: number | null;
  /** Set when the run was scanned text, resized by redrawing it. */
  private scanPrev: ScanOverride | null = null;
  private scanTarget: number | null = null;
  private rewrap: ReflowWrapCommand | null = null;

  constructor(opts: { pageIndex: number; runId: string; nextSize: number }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextSize = opts.nextSize;
    this.prevSize = null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    refuseRedrawOfReadOnlyText(run);
    liftRunToPage(doc, page, run);
    // Scaled from the size actually drawn: before the first edit the run may
    // still report OCR's guess, which is far off. Fixed once, so redo matches.
    const drawn = scanDrawnSize(doc, page, run);
    if (drawn !== null)
      this.scanTarget ??=
        (drawn * this.nextSize) / Math.max(0.01, run.fontSize);
    const target = this.scanTarget;
    const scanPrev =
      target === null
        ? null
        : setScanOverride(doc, page, run, (o) => ({ ...o, fontSize: target }));
    if (scanPrev) {
      this.scanPrev = scanPrev;
      return;
    }
    if (!run.pdfiumObjPtr) return;
    if (this.prevSize === null) {
      this.prevSize = run.fontSize;
    }
    const bold = isFauxBold(run);
    const ratio = this.nextSize / Math.max(0.01, run.fontSize);
    if (this.rewrap) this.rewrap.apply(doc);
    else if (ratio > 1) this.rewrap = wrapToFitGrown(doc, page, run, ratio);
    // Scale about the run's own baseline anchor, NOT the page origin - scaling
    // about moves the glyphs diagonally and the move persists on save.
    this.scaleAllPtrs(
      doc,
      collectMemberPtrs(run),
      ratio,
      run.matrix.e,
      run.matrix.f,
    );
    run.fontSize = this.nextSize;
    run.matrix = scaleMatrix(
      run.matrix,
      this.nextSize / Math.max(0.01, this.prevSize),
    );
    rescaleRunModel(run, ratio, run.matrix.e, run.matrix.f);
    // The glyph gaps scale with the glyphs, so the tracked letter-spacing
    // must scale too or a later edit re-emits with the stale pt value.
    run.charSpacingPt *= ratio;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.outline = bold
      ? new SetTextOutlineCommand({
          pageIndex: this.pageIndex,
          runId: this.runId,
          stroke: { ...run.fill, a: 255 },
          width: fauxBoldWidth(run.fontSize),
        })
      : null;
    this.outline?.apply(doc);
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
    if (this.prevSize === null) return;
    this.outline?.revert(doc);
    this.outline = null;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !run.pdfiumObjPtr) return;
    const ratio = this.prevSize / Math.max(0.01, run.fontSize);
    this.scaleAllPtrs(
      doc,
      collectMemberPtrs(run),
      ratio,
      run.matrix.e,
      run.matrix.f,
    );
    run.fontSize = this.prevSize;
    run.matrix = scaleMatrix(run.matrix, ratio);
    rescaleRunModel(run, ratio, run.matrix.e, run.matrix.f);
    run.charSpacingPt *= ratio;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.rewrap?.revert(doc);
  }

  private scaleAllPtrs(
    doc: EditorDocument,
    ptrs: number[],
    relativeScale: number,
    anchorX: number,
    anchorY: number,
  ): void {
    if (!Number.isFinite(relativeScale) || relativeScale === 1) return;
    const m = doc.module;
    // Scale about (anchorX, anchorY): translate(-a) · scale(s) · translate(+a)
    // collapses to [s,0,0,s, ax*(1-s), ay*(1-s)] - a single Transform call.
    const tx = anchorX * (1 - relativeScale);
    const ty = anchorY * (1 - relativeScale);
    const seen = new Set<number>();
    for (const ptr of ptrs) {
      if (!ptr || seen.has(ptr)) continue;
      seen.add(ptr);
      try {
        transformObject(
          m,

          ptr,
          relativeScale,
          0,
          0,
          relativeScale,
          tx,
          ty,
        );
      } catch {
        /* best-effort - missing ptr is silently skipped */
      }
    }
  }

  /** The stepper fires per tick; coalesce so one adjustment is one undo step. */
  coalesceKey(): string {
    return `set-font-size:${this.pageIndex}:${this.runId}`;
  }
}

/** Mirror the PDFium object scaling in the run's model bookkeeping. */
function rescaleRunModel(
  run: TextRun,
  s: number,
  ax: number,
  ay: number,
): void {
  if (!Number.isFinite(s) || s === 1) return;
  const mapX = (x: number) => s * x + (1 - s) * ax;
  const mapY = (y: number) => s * y + (1 - s) * ay;
  run.bounds = {
    x: mapX(run.bounds.x),
    y: mapY(run.bounds.y),
    width: run.bounds.width * s,
    height: run.bounds.height * s,
  };
  run.mergedFromBounds = run.mergedFromBounds.map((b) => ({
    x: mapX(b.x),
    right: mapX(b.right),
  }));
  run.paragraphMemberFs = run.paragraphMemberFs.map(mapY);
  if (run.paragraphLineHeight > 0) run.paragraphLineHeight *= s;
  for (const slot of run.paragraphLineSlots) {
    slot.baselineY = mapY(slot.baselineY);
    slot.matrixE = mapX(slot.matrixE);
    slot.fontSize *= s;
    slot.mergedFromBounds = slot.mergedFromBounds.map((b) => ({
      x: mapX(b.x),
      right: mapX(b.right),
    }));
  }
}

function scaleMatrix(
  m: { a: number; b: number; c: number; d: number; e: number; f: number },
  ratio: number,
) {
  if (!Number.isFinite(ratio) || ratio === 1) return m;
  // Only the scale part changes; the anchor (e,f) stays put so the run keeps
  // its on-page position (matches the anchored object Transform above).
  return {
    a: m.a * ratio,
    b: m.b * ratio,
    c: m.c * ratio,
    d: m.d * ratio,
    e: m.e,
    f: m.f,
  };
}

function wrapToFitGrown(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  ratio: number,
): ReflowWrapCommand | null {
  const right = page.display.cropRight;
  const room = right - run.bounds.x;
  if (run.bounds.width * ratio <= room + 0.5) return null;
  if (room < run.fontSize * ratio * 2) return null;
  const reflow = new ReflowWrapCommand({
    pageIndex: page.index,
    runId: run.id,
    maxWidthPt: room / ratio,
  });
  reflow.apply(doc);
  return reflow;
}
