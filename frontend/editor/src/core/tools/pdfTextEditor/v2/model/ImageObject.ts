import type {
  Affine,
  ImageObjectSnapshot,
  PageRect,
} from "@app/tools/pdfTextEditor/v2/types";

export class ImageObject {
  readonly id: string;
  readonly pageIndex: number;
  pdfiumObjPtr: number;
  bounds: PageRect;
  matrix: Affine;
  dirty: boolean;
  /** Session-only lock; see TextRun.locked. */
  locked: boolean;

  constructor(init: ImageObjectSnapshot & { pdfiumObjPtr: number }) {
    this.id = init.id;
    this.pageIndex = init.pageIndex;
    this.pdfiumObjPtr = init.pdfiumObjPtr;
    this.bounds = init.bounds;
    this.matrix = init.matrix;
    this.dirty = false;
    this.locked = init.locked ?? false;
  }

  snapshot(): ImageObjectSnapshot {
    return {
      id: this.id,
      pageIndex: this.pageIndex,
      bounds: { ...this.bounds },
      matrix: { ...this.matrix },
      locked: this.locked || undefined,
    };
  }
}
