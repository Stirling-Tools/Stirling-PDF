import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";

export type LineAlignMode = "left" | "center-h" | "right";

/**
 * Horizontally align the LINES inside a single multi-line paragraph run
 * relative to each other (flush-left, centred, or flush-right) - the
 * familiar paragraph-alignment action, available when just one paragraph
 * is selected (multi-object align still works across a 2+ selection).
 *
 * Each line's glyph objects (`paragraphLineSlots[i].mergedFromPtrs`) are
 * translated by a per-line dx via `FPDFPageObj_Transform` - the same
 * primitive `MoveTextRunCommand` uses - so embedded fonts are preserved
 * (no re-emit). The per-line dx values are recorded for an exact revert.
 */
export class AlignParagraphLinesCommand implements Command {
  readonly type = "align-paragraph-lines";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly mode: LineAlignMode;
  /** Per-line dx actually applied, parallel to the run's line slots. */
  private appliedDx: number[] = [];

  constructor(opts: { pageIndex: number; runId: string; mode: LineAlignMode }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.mode = opts.mode;
  }

  /** True when this run can be line-aligned (a multi-line paragraph). */
  static canAlign(run: TextRun): boolean {
    return run.paragraphLineSlots.length >= 2;
  }

  private lineExtent(
    run: TextRun,
    i: number,
  ): { left: number; right: number } | null {
    const slot = run.paragraphLineSlots[i];
    if (!slot || slot.mergedFromBounds.length === 0) return null;
    let left = Infinity;
    let right = -Infinity;
    for (const b of slot.mergedFromBounds) {
      if (b.x < left) left = b.x;
      if (b.right > right) right = b.right;
    }
    return Number.isFinite(left) && Number.isFinite(right)
      ? { left, right }
      : null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !AlignParagraphLinesCommand.canAlign(run)) return;

    // Paragraph-wide left/right edge across every line.
    const extents = run.paragraphLineSlots.map((_, i) =>
      this.lineExtent(run, i),
    );
    let paraLeft = Infinity;
    let paraRight = -Infinity;
    for (const e of extents) {
      if (!e) continue;
      if (e.left < paraLeft) paraLeft = e.left;
      if (e.right > paraRight) paraRight = e.right;
    }
    if (!Number.isFinite(paraLeft) || !Number.isFinite(paraRight)) return;
    const paraCentre = (paraLeft + paraRight) / 2;

    const m = doc.module;
    this.appliedDx = run.paragraphLineSlots.map((_, i) => {
      const e = extents[i];
      if (!e) return 0;
      const dx =
        this.mode === "left"
          ? paraLeft - e.left
          : this.mode === "right"
            ? paraRight - e.right
            : paraCentre - (e.left + e.right) / 2;
      return Math.abs(dx) < 0.01 ? 0 : dx;
    });

    let moved = false;
    run.paragraphLineSlots.forEach((_slot, i) => {
      const dx = this.appliedDx[i];
      if (!dx) return;
      this.shiftLine(m, run, i, dx);
      moved = true;
    });
    if (!moved) {
      this.appliedDx = [];
      return;
    }
    this.refreshBounds(run);
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (this.appliedDx.length === 0) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;
    run.paragraphLineSlots.forEach((_slot, i) => {
      const dx = this.appliedDx[i];
      if (!dx) return;
      this.shiftLine(m, run, i, -dx);
    });
    this.refreshBounds(run);
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.appliedDx = [];
  }

  /** Translate one line's glyph objects + its model bounds by dx. */
  private shiftLine(
    m: import("@embedpdf/pdfium").WrappedPdfiumModule,
    run: TextRun,
    i: number,
    dx: number,
  ): void {
    const slot = run.paragraphLineSlots[i];
    if (!slot) return;
    const seen = new Set<number>();
    for (const ptr of slot.mergedFromPtrs) {
      if (!ptr || seen.has(ptr)) continue;
      seen.add(ptr);
      try {
        m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, dx, 0);
      } catch {
        /* best-effort */
      }
    }
    slot.matrixE += dx;
    slot.mergedFromBounds = slot.mergedFromBounds.map((b) => ({
      x: b.x + dx,
      right: b.right + dx,
    }));
  }

  /** Recompute the paragraph rep's horizontal bounds from its lines. */
  private refreshBounds(run: TextRun): void {
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < run.paragraphLineSlots.length; i++) {
      const e = this.lineExtent(run, i);
      if (!e) continue;
      if (e.left < left) left = e.left;
      if (e.right > right) right = e.right;
    }
    if (Number.isFinite(left) && Number.isFinite(right)) {
      run.bounds = { ...run.bounds, x: left, width: Math.max(0, right - left) };
    }
  }
}
