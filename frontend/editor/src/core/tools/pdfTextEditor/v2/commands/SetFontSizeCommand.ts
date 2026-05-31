import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Scale a text run so its effective on-page size matches `nextSize`.
 *
 * PDFium does not expose a public setter for a text object's font size;
 * the recommended path is to scale the object's matrix by the ratio of
 * the new size to the current effective size. The visible bitmap then
 * re-renders at the requested size when `FPDFPage_GenerateContent` runs.
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
    this.scaleTo(
      doc,
      run.pdfiumObjPtr,
      this.nextSize / Math.max(0.01, run.fontSize),
    );
    run.fontSize = this.nextSize;
    run.matrix = scaleMatrix(
      run.matrix,
      this.nextSize / Math.max(0.01, this.prevSize),
    );
    run.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }

  revert(doc: EditorDocument): void {
    if (this.prevSize === null) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !run.pdfiumObjPtr) return;
    this.scaleTo(
      doc,
      run.pdfiumObjPtr,
      this.prevSize / Math.max(0.01, run.fontSize),
    );
    const ratio = this.prevSize / Math.max(0.01, run.fontSize);
    run.fontSize = this.prevSize;
    run.matrix = scaleMatrix(run.matrix, ratio);
    run.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }

  private scaleTo(
    doc: EditorDocument,
    objPtr: number,
    relativeScale: number,
  ): void {
    if (!Number.isFinite(relativeScale) || relativeScale === 1) return;
    doc.module.FPDFPageObj_Transform(
      objPtr,
      relativeScale,
      0,
      0,
      relativeScale,
      0,
      0,
    );
  }
}

function scaleMatrix(
  m: { a: number; b: number; c: number; d: number; e: number; f: number },
  ratio: number,
) {
  if (!Number.isFinite(ratio) || ratio === 1) return m;
  return {
    a: m.a * ratio,
    b: m.b * ratio,
    c: m.c * ratio,
    d: m.d * ratio,
    e: m.e * ratio,
    f: m.f * ratio,
  };
}
