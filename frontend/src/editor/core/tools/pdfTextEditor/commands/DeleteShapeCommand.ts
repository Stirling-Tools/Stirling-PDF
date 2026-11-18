import { liftFormToPage } from "@editor/tools/pdfTextEditor/commands/liftFromForm";
import { pageObjectIndex } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { ShapeObject } from "@editor/tools/pdfTextEditor/model/ShapeObject";
import type { PageRuleSnapshot } from "@editor/tools/pdfTextEditor/types";
import { insertPageObjectAt } from "@editor/tools/pdfTextEditor/util/insertPageObject";

/**
 * Remove a vector shape. One inside a form XObject has that form's instance
 * lifted onto the page first, so the shape goes from the instance it was
 * picked in and every other use of the form still draws it. Does nothing when
 * the form cannot be lifted: a shape the form keeps drawing would only vanish
 * from the editor and still be in the saved file.
 */
export class DeleteShapeCommand implements Command {
  readonly type = "delete-shape";
  private readonly pageIndex: number;
  private readonly shapeId: string;
  private removed: ShapeObject | null = null;
  private removedRules: PageRuleSnapshot[] = [];
  private removedFills: PageRuleSnapshot[] = [];
  /** Position among the shapes and in the page's object list, for revert. */
  private shapeIndex = -1;
  private objectIndex = -1;

  constructor(opts: { pageIndex: number; shapeId: string }) {
    this.pageIndex = opts.pageIndex;
    this.shapeId = opts.shapeId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const shape = page.findShape(this.shapeId);
    if (!shape || !shape.pdfiumObjPtr) return;
    if (shape.containerPtr && !liftFormToPage(doc, page, shape.containerPtr))
      return;
    const m = doc.module;
    const objectIndex = pageObjectIndex(
      doc.module,
      page.pagePtr,
      shape.pdfiumObjPtr,
    );
    if (!m.FPDFPage_RemoveObject(page.pagePtr, shape.pdfiumObjPtr)) return;
    this.objectIndex = objectIndex;
    this.shapeIndex = page.shapes.indexOf(shape);
    this.removed = shape;
    this.removedRules = page.rules.filter(
      (rule) => rule.ptr === shape.pdfiumObjPtr,
    );
    this.removedFills = page.fills.filter(
      (fill) => fill.ptr === shape.pdfiumObjPtr,
    );
    page.setRules(page.rules.filter((rule) => rule.ptr !== shape.pdfiumObjPtr));
    page.setFills(page.fills.filter((fill) => fill.ptr !== shape.pdfiumObjPtr));
    page.setShapes(page.shapes.filter((s) => s !== shape));
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const shape = this.removed;
    if (!shape) return;
    const page = doc.page(this.pageIndex);
    insertPageObjectAt(
      doc.module,
      page.pagePtr,
      shape.pdfiumObjPtr,
      this.objectIndex,
    );
    const shapes = [...page.shapes];
    shapes.splice(
      this.shapeIndex >= 0 ? this.shapeIndex : shapes.length,
      0,
      shape,
    );
    page.setShapes(shapes);
    page.setRules([...page.rules, ...this.removedRules]);
    page.setFills([...page.fills, ...this.removedFills]);
    this.removedRules = [];
    this.removedFills = [];
    this.removed = null;
    page.markDirty();
    page.markNeedsGenerate();
  }
}
