import type {
  Affine,
  PageRect,
  ShapeObjectSnapshot,
} from "@app/tools/pdfTextEditor/types";

/** A vector path object on a page; `bounds` is in raw PDF page space. */
export class ShapeObject {
  readonly id: string;
  readonly pageIndex: number;
  pdfiumObjPtr: number;
  /** Owning form XObject, or 0 when the shape sits on the page. */
  containerPtr: number;
  /** Maps the container's local space to page space; identity on the page. */
  containerTransform: Affine;
  bounds: PageRect;

  constructor(
    init: ShapeObjectSnapshot & {
      pdfiumObjPtr: number;
      containerPtr: number;
      containerTransform: Affine;
    },
  ) {
    this.id = init.id;
    this.pageIndex = init.pageIndex;
    this.pdfiumObjPtr = init.pdfiumObjPtr;
    this.containerPtr = init.containerPtr;
    this.containerTransform = init.containerTransform;
    this.bounds = init.bounds;
  }

  snapshot(): ShapeObjectSnapshot {
    return {
      id: this.id,
      pageIndex: this.pageIndex,
      bounds: { ...this.bounds },
    };
  }
}
