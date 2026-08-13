import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/** Scale a text run so its effective on-page size matches `nextSize`. */
export class SetFontSizeCommand implements Command {
  readonly type = "set-font-size";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextSize: number;
  private prevSize: number | null;

  constructor(opts: { pageIndex: number; runId: string; nextSize: number }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextSize = opts.nextSize;
    this.prevSize = null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !run.pdfiumObjPtr) return;
    if (this.prevSize === null) {
      this.prevSize = run.fontSize;
    }
    const ratio = this.nextSize / Math.max(0.01, run.fontSize);
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
  }

  revert(doc: EditorDocument): void {
    if (this.prevSize === null) return;
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
        m.FPDFPageObj_Transform(
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
  run: import("@app/tools/pdfTextEditor/v2/model/TextRun").TextRun,
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
