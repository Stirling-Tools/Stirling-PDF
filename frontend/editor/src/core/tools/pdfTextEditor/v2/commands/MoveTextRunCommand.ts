import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Translate a text run by (dx, dy) in PDF page-space points.
 *
 * Uses post-multiply `FPDFPageObj_Transform(obj, 1, 0, 0, 1, dx, dy)`
 * which preserves any scale/rotation already baked into the run's
 * matrix and just moves it.
 */
export class MoveTextRunCommand implements Command {
  readonly type = "move-text-run";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly dx: number;
  private readonly dy: number;
  private applied: boolean;

  constructor(opts: {
    pageIndex: number;
    runId: string;
    dx: number;
    dy: number;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.dx = opts.dx;
    this.dy = opts.dy;
    this.applied = false;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !run.pdfiumObjPtr) return;
    doc.module.FPDFPageObj_Transform(
      run.pdfiumObjPtr,
      1,
      0,
      0,
      1,
      this.dx,
      this.dy,
    );
    run.matrix = {
      ...run.matrix,
      e: run.matrix.e + this.dx,
      f: run.matrix.f + this.dy,
    };
    run.bounds = {
      ...run.bounds,
      x: run.bounds.x + this.dx,
      y: run.bounds.y + this.dy,
    };
    run.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
    this.applied = true;
  }

  revert(doc: EditorDocument): void {
    if (!this.applied) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !run.pdfiumObjPtr) return;
    doc.module.FPDFPageObj_Transform(
      run.pdfiumObjPtr,
      1,
      0,
      0,
      1,
      -this.dx,
      -this.dy,
    );
    run.matrix = {
      ...run.matrix,
      e: run.matrix.e - this.dx,
      f: run.matrix.f - this.dy,
    };
    run.bounds = {
      ...run.bounds,
      x: run.bounds.x - this.dx,
      y: run.bounds.y - this.dy,
    };
    run.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
    this.applied = false;
  }
}
