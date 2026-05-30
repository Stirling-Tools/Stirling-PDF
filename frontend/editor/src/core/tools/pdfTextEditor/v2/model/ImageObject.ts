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

  constructor(init: ImageObjectSnapshot & { pdfiumObjPtr: number }) {
    this.id = init.id;
    this.pageIndex = init.pageIndex;
    this.pdfiumObjPtr = init.pdfiumObjPtr;
    this.bounds = init.bounds;
    this.matrix = init.matrix;
    this.dirty = false;
  }

  snapshot(): ImageObjectSnapshot {
    return {
      id: this.id,
      pageIndex: this.pageIndex,
      bounds: { ...this.bounds },
      matrix: { ...this.matrix },
    };
  }
}
