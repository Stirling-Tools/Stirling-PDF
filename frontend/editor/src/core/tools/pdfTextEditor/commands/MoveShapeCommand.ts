import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { transformObject } from "@app/tools/pdfTextEditor/util/objectTransform";

/** Translate a vector shape by (dx, dy) in PDF page-space points. */
export class MoveShapeCommand implements Command {
  readonly type = "move-shape";
  private readonly pageIndex: number;
  private readonly shapeId: string;
  private readonly dx: number;
  private readonly dy: number;
  private applied = false;

  constructor(opts: {
    pageIndex: number;
    shapeId: string;
    dx: number;
    dy: number;
  }) {
    this.pageIndex = opts.pageIndex;
    this.shapeId = opts.shapeId;
    this.dx = opts.dx;
    this.dy = opts.dy;
  }

  apply(doc: EditorDocument): void {
    this.shift(doc, this.dx, this.dy);
    this.applied = true;
  }

  revert(doc: EditorDocument): void {
    if (!this.applied) return;
    this.shift(doc, -this.dx, -this.dy);
    this.applied = false;
  }

  private shift(doc: EditorDocument, dx: number, dy: number): void {
    const page = doc.page(this.pageIndex);
    const shape = page.findShape(this.shapeId);
    // A form child's new position renders but is not written back on save.
    if (!shape || !shape.pdfiumObjPtr || shape.containerPtr) return;
    transformObject(doc.module, shape.pdfiumObjPtr, 1, 0, 0, 1, dx, dy);
    shape.bounds = {
      ...shape.bounds,
      x: shape.bounds.x + dx,
      y: shape.bounds.y + dy,
    };
    page.markDirty();
    page.markNeedsGenerate();
  }
}
