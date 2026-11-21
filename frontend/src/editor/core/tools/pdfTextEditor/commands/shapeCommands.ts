import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { pageObjectIndex } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { ShapeObject } from "@editor/tools/pdfTextEditor/model/ShapeObject";
import type {
  DrawnShape,
  PageRect,
  RGBA,
  ShapeKind,
} from "@editor/tools/pdfTextEditor/types";
import { insertPageObjectAt } from "@editor/tools/pdfTextEditor/util/insertPageObject";

const INK: RGBA = { r: 33, g: 33, b: 38, a: 255 };
const BOX_FILL: RGBA = { r: 232, g: 236, b: 242, a: 255 };

/** What a newly drawn shape of each kind looks like, and its size in points. */
export const NEW_SHAPES: Record<
  ShapeKind,
  { width: number; height: number; style: DrawnShape }
> = {
  line: {
    width: 200,
    height: 1,
    style: { kind: "line", stroke: null, fill: INK, strokeWidth: 1 },
  },
  rectangle: {
    width: 160,
    height: 100,
    style: { kind: "rectangle", stroke: INK, fill: null, strokeWidth: 1 },
  },
  box: {
    width: 160,
    height: 100,
    style: { kind: "box", stroke: null, fill: BOX_FILL, strokeWidth: 0 },
  },
};

/** The smallest a drawn shape can be resized to, in points. */
export const MIN_SHAPE_PT = 4;

// A line is a thin filled rectangle: robust across PDFium builds, as the
// table rules are drawn.
function drawRect(
  m: WrappedPdfiumModule,
  page: Page,
  bounds: PageRect,
  style: DrawnShape,
  objectIndex: number,
): number {
  const ptr = m.FPDFPageObj_CreateNewRect(
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
  );
  if (!ptr) return 0;
  if (style.fill) {
    const { r, g, b, a } = style.fill;
    m.FPDFPageObj_SetFillColor(ptr, r, g, b, a);
  }
  if (style.stroke) {
    const { r, g, b, a } = style.stroke;
    m.FPDFPageObj_SetStrokeColor(ptr, r, g, b, a);
    m.FPDFPageObj_SetStrokeWidth(ptr, style.strokeWidth);
  }
  m.FPDFPath_SetDrawMode(ptr, style.fill ? 2 : 0, style.stroke !== null);
  insertPageObjectAt(m, page.pagePtr, ptr, objectIndex);
  return ptr;
}

/** Draw a new line, outlined rectangle or filled box with its top-left corner at a page point. */
export class InsertShapeCommand implements Command {
  readonly type = "insert-shape";
  private readonly pageIndex: number;
  private readonly kind: ShapeKind;
  private readonly x: number;
  private readonly y: number;
  private shape: ShapeObject | null = null;

  constructor(opts: {
    pageIndex: number;
    kind: ShapeKind;
    x: number;
    y: number;
  }) {
    this.pageIndex = opts.pageIndex;
    this.kind = opts.kind;
    this.x = opts.x;
    this.y = opts.y;
  }

  get insertedShapeId(): string | null {
    return this.shape?.id ?? null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const { width, height, style } = NEW_SHAPES[this.kind];
    const { cropLeft, cropBottom, cropRight, cropTop } = page.display;
    const bounds = {
      x: Math.max(cropLeft, Math.min(this.x, cropRight - width)),
      y: Math.max(cropBottom, Math.min(this.y - height, cropTop - height)),
      width,
      height,
    };
    const ptr = drawRect(doc.module, page, bounds, style, -1);
    if (!ptr) return;
    // Kept across redo: later steps find the shape by this id.
    const id = this.shape?.id ?? `p${page.index}-new-shape-${ptr}`;
    this.shape = new ShapeObject({
      id,
      pageIndex: page.index,
      bounds,
      pdfiumObjPtr: ptr,
      containerPtr: 0,
      drawn: { ...style },
    });
    page.setShapes([...page.shapes, this.shape]);
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const shape = this.shape;
    if (!shape) return;
    const page = doc.page(this.pageIndex);
    doc.module.FPDFPage_RemoveObject(page.pagePtr, shape.pdfiumObjPtr);
    page.setShapes(page.shapes.filter((s) => s.id !== shape.id));
    page.markDirty();
    page.markNeedsGenerate();
  }
}

// The requested bounds keep their top edge where the handle left it; the
// height is clamped, and a line keeps its own, so the bottom gives way.
function anchoredAtTop(
  requested: PageRect,
  kind: ShapeKind,
  current: PageRect,
): PageRect {
  const top = requested.y + requested.height;
  const height =
    kind === "line" ? current.height : Math.max(MIN_SHAPE_PT, requested.height);
  return {
    x: requested.x,
    y: top - height,
    width: Math.max(MIN_SHAPE_PT, requested.width),
    height,
  };
}

/** Redraw a shape drawn this session at new bounds or in new colours, in the same place in the page's drawing order. */
export class ReshapeCommand implements Command {
  readonly type = "reshape";
  private readonly pageIndex: number;
  private readonly shapeId: string;
  private readonly bounds: PageRect | undefined;
  private readonly colours: Partial<Pick<DrawnShape, "stroke" | "fill">>;
  private prev: { ptr: number; bounds: PageRect; drawn: DrawnShape } | null =
    null;
  private nextPtr = 0;

  constructor(opts: {
    pageIndex: number;
    shapeId: string;
    bounds?: PageRect;
    stroke?: RGBA | null;
    fill?: RGBA | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.shapeId = opts.shapeId;
    this.bounds = opts.bounds;
    this.colours = {};
    if (opts.stroke !== undefined) this.colours.stroke = opts.stroke;
    if (opts.fill !== undefined) this.colours.fill = opts.fill;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const shape = page.findShape(this.shapeId);
    if (!shape?.drawn) return;
    const m = doc.module;
    const index = pageObjectIndex(m, page.pagePtr, shape.pdfiumObjPtr);
    const drawn = { ...shape.drawn, ...this.colours };
    const bounds = this.bounds
      ? anchoredAtTop(this.bounds, drawn.kind, shape.bounds)
      : shape.bounds;
    const ptr = drawRect(m, page, bounds, drawn, index);
    if (!ptr) return;
    m.FPDFPage_RemoveObject(page.pagePtr, shape.pdfiumObjPtr);
    this.prev = {
      ptr: shape.pdfiumObjPtr,
      bounds: shape.bounds,
      drawn: shape.drawn,
    };
    this.nextPtr = ptr;
    shape.pdfiumObjPtr = ptr;
    shape.bounds = bounds;
    shape.drawn = drawn;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const prev = this.prev;
    if (!prev) return;
    const page = doc.page(this.pageIndex);
    const shape = page.findShape(this.shapeId);
    if (!shape) return;
    const m = doc.module;
    const index = pageObjectIndex(m, page.pagePtr, this.nextPtr);
    m.FPDFPage_RemoveObject(page.pagePtr, this.nextPtr);
    insertPageObjectAt(m, page.pagePtr, prev.ptr, index);
    shape.pdfiumObjPtr = prev.ptr;
    shape.bounds = prev.bounds;
    shape.drawn = prev.drawn;
    this.prev = null;
    page.markDirty();
    page.markNeedsGenerate();
  }
}
