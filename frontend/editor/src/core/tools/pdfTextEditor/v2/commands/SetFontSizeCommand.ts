import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/**
 * Scale a text run so its effective on-page size matches `nextSize`.
 *
 * PDFium does not expose a public setter for a text object's font size;
 * the recommended path is to scale the object's matrix by the ratio of
 * the new size to the current effective size. The visible bitmap then
 * re-renders at the requested size when `FPDFPage_GenerateContent` runs.
 *
 * For LineGrouper-merged runs and paragraphs (which back the rep with
 * multiple PDFium sub-objects), Transform is applied to EVERY sub-ptr -
 * scaling only `run.pdfiumObjPtr` would leave the other sub-words at
 * their original size.
 *
 * `nextSize` is in points (matches what the user types in the toolbar).
 */
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
    // about (0,0) moves the glyphs diagonally (toward/away from the corner) and
    // the move persists on save. Anchor stays fixed; only the size changes.
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
}

/**
 * Mirror the PDFium object scaling in the run's model bookkeeping. The
 * object transform maps every point p -> s*p + (1-s)*anchor, so bounds,
 * per-line baselines, slot anchors and the paragraph line height must map
 * the same way - otherwise the NEXT edit/family change re-emits at the old
 * baseline grid (overlapping or gapped lines) and hit-testing uses a stale
 * box.
 */
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
