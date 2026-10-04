import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { ShapeObject } from "@app/tools/pdfTextEditor/model/ShapeObject";
import { transformObject } from "@app/tools/pdfTextEditor/util/objectTransform";
import { SCRATCH, scratchPtr } from "@app/tools/pdfTextEditor/util/wasmScratch";

interface PageInsertModule {
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    index: number,
  ) => boolean;
}

interface DrawMode {
  fillMode: number;
  stroke: boolean;
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * Remove a vector shape. A shape on the page leaves the object list at once.
 * One inside a form XObject is hidden and queued in `pendingFormRemovals` for
 * the save to remove: PDFium writes back a form child's removal but not its
 * paint, and has no call to put a removed child back, so removing it here
 * would make the delete impossible to undo.
 */
export class DeleteShapeCommand implements Command {
  readonly type = "delete-shape";
  private readonly pageIndex: number;
  private readonly shapeId: string;
  private removed: ShapeObject | null = null;
  /** Position among the shapes and in the page's object list, for revert. */
  private shapeIndex = -1;
  private objectIndex = -1;
  /** Paint a hidden form child had, for revert. */
  private hiddenDrawMode: DrawMode | null = null;

  constructor(opts: { pageIndex: number; shapeId: string }) {
    this.pageIndex = opts.pageIndex;
    this.shapeId = opts.shapeId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const shape = page.findShape(this.shapeId);
    if (!shape || !shape.pdfiumObjPtr) return;
    const m = doc.module;
    this.shapeIndex = page.shapes.indexOf(shape);
    if (shape.containerPtr) {
      const drawMode = readDrawMode(m, shape.pdfiumObjPtr);
      if (!drawMode) return;
      if (!m.FPDFPath_SetDrawMode(shape.pdfiumObjPtr, 0, false)) return;
      this.hiddenDrawMode = drawMode;
      page.pendingFormRemovals.set(shape.pdfiumObjPtr, shape.containerPtr);
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
    if (this.hiddenDrawMode) {
      m.FPDFPath_SetDrawMode(
        shape.pdfiumObjPtr,
        this.hiddenDrawMode.fillMode,
        this.hiddenDrawMode.stroke,
      );
      this.hiddenDrawMode = null;
      if (!page.pendingFormRemovals.delete(shape.pdfiumObjPtr)) {
        restoreOntoPage(doc, page, shape);
      }
    } else {
      insertOnPage(doc, page, shape.pdfiumObjPtr, this.objectIndex);
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

/**
 * A save has already removed this shape from its form, and a form child cannot
 * be re-added, so it returns as a page object just below that form, mapped to
 * the same place on the page.
 */
function restoreOntoPage(
  doc: EditorDocument,
  page: Page,
  shape: ShapeObject,
): void {
  const t = shape.containerTransform;
  transformObject(doc.module, shape.pdfiumObjPtr, t.a, t.b, t.c, t.d, t.e, t.f);
  const formIndex = indexOnPage(doc, page.pagePtr, shape.topLevelContainerPtr);
  insertOnPage(doc, page, shape.pdfiumObjPtr, formIndex);
  shape.containerPtr = 0;
  shape.topLevelContainerPtr = 0;
  shape.containerTransform = { ...IDENTITY };
}

function insertOnPage(
  doc: EditorDocument,
  page: Page,
  objPtr: number,
  index: number,
): void {
  const m = doc.module;
  const inserted =
    index >= 0 &&
    (m as unknown as PageInsertModule).FPDFPage_InsertObjectAtIndex?.(
      page.pagePtr,
      objPtr,
      index,
    );
  if (!inserted) m.FPDFPage_InsertObject(page.pagePtr, objPtr);
}

function readDrawMode(m: WrappedPdfiumModule, objPtr: number): DrawMode | null {
  const buf = scratchPtr(m, SCRATCH.shapeDrawMode, 8);
  if (!m.FPDFPath_GetDrawMode(objPtr, buf, buf + 4)) return null;
  return {
    fillMode: m.pdfium.getValue(buf, "i32"),
    stroke: m.pdfium.getValue(buf + 4, "i32") !== 0,
  };
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
