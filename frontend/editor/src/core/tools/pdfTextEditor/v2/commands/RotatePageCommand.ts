import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Rotate a page by 90 degrees clockwise or counter-clockwise.
 *
 * PDFium stores page rotation as a value 0..3 (each step = 90deg cw).
 * We read the current rotation, add/subtract 1, normalize to 0..3, and
 * call FPDFPage_SetRotation. Revert applies the inverse delta.
 */
export class RotatePageCommand implements Command {
  readonly type = "rotate-page";
  private readonly pageIndex: number;
  private readonly delta: 1 | -1;

  constructor(opts: { pageIndex: number; delta: 1 | -1 }) {
    this.pageIndex = opts.pageIndex;
    this.delta = opts.delta;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const current = doc.module.FPDFPage_GetRotation(page.pagePtr);
    const next = (((current + this.delta) % 4) + 4) % 4;
    doc.module.FPDFPage_SetRotation(page.pagePtr, next);
    page.markDirty();
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const current = doc.module.FPDFPage_GetRotation(page.pagePtr);
    const next = (((current - this.delta) % 4) + 4) % 4;
    doc.module.FPDFPage_SetRotation(page.pagePtr, next);
    page.markDirty();
  }
}
