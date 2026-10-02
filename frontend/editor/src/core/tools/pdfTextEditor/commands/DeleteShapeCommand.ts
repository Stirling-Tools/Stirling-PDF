import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { ShapeObject } from "@app/tools/pdfTextEditor/model/ShapeObject";

interface FormObjectModule {
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
  FPDFFormObj_InsertObject?: (form: number, obj: number) => boolean;
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    index: number,
  ) => boolean;
}

/** Remove a vector shape from its page or form XObject. */
export class DeleteShapeCommand implements Command {
  readonly type = "delete-shape";
  private readonly pageIndex: number;
  private readonly shapeId: string;
  private removed: ShapeObject | null = null;
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
    const m = doc.module;
    const formMod = m as unknown as FormObjectModule;
    this.shapeIndex = page.shapes.indexOf(shape);
    if (shape.containerPtr) {
      if (
        !formMod.FPDFFormObj_RemoveObject?.(
          shape.containerPtr,
          shape.pdfiumObjPtr,
        )
      )
        return;
    } else {
      this.objectIndex = indexOnPage(doc, page.pagePtr, shape.pdfiumObjPtr);
      if (!m.FPDFPage_RemoveObject(page.pagePtr, shape.pdfiumObjPtr)) return;
    }
    this.removed = shape;
    page.setShapes(page.shapes.filter((s) => s !== shape));
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const shape = this.removed;
    if (!shape) return;
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    const formMod = m as unknown as FormObjectModule;
    if (shape.containerPtr) {
      formMod.FPDFFormObj_InsertObject?.(
        shape.containerPtr,
        shape.pdfiumObjPtr,
      );
    } else if (
      this.objectIndex < 0 ||
      !formMod.FPDFPage_InsertObjectAtIndex?.(
        page.pagePtr,
        shape.pdfiumObjPtr,
        this.objectIndex,
      )
    ) {
      m.FPDFPage_InsertObject(page.pagePtr, shape.pdfiumObjPtr);
    }
    const shapes = [...page.shapes];
    shapes.splice(
      this.shapeIndex >= 0 ? this.shapeIndex : shapes.length,
      0,
      shape,
    );
    page.setShapes(shapes);
    this.removed = null;
    page.markDirty();
    page.markNeedsGenerate();
  }
}

function indexOnPage(
  doc: EditorDocument,
  pagePtr: number,
  objPtr: number,
): number {
  const total = doc.module.FPDFPage_CountObjects(pagePtr);
  for (let i = 0; i < total; i++) {
    if (doc.module.FPDFPage_GetObject(pagePtr, i) === objPtr) return i;
  }
  return -1;
}
