import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";

/**
 * Wraps one PDFium page pointer.
 *
 * Lazily reads its text runs and image objects on first `ensureLoaded()`.
 * Tracks dirty state so the document save knows which pages need a
 * regeneration pass.
 */
export class Page {
  readonly index: number;
  readonly pagePtr: number;
  readonly width: number;
  readonly height: number;
  runs: TextRun[];
  images: ImageObject[];
  /** True if any object on this page has uncommitted mutation. */
  dirty: boolean;
  /** True if the lazy reader has populated runs/images. */
  loaded: boolean;
  /**
   * Monotonic version counter, bumped on every commit. The PageView
   * useEffect depends on this so it re-renders the bitmap even when the
   * `dirty` flag has already been true for the previous edit.
   */
  revision: number;

  constructor(opts: {
    index: number;
    pagePtr: number;
    width: number;
    height: number;
  }) {
    this.index = opts.index;
    this.pagePtr = opts.pagePtr;
    this.width = opts.width;
    this.height = opts.height;
    this.runs = [];
    this.images = [];
    this.dirty = false;
    this.loaded = false;
    this.revision = 0;
  }

  setRuns(runs: TextRun[]): void {
    this.runs = runs;
  }

  setImages(images: ImageObject[]): void {
    this.images = images;
  }

  markDirty(): void {
    this.dirty = true;
    this.revision += 1;
  }

  clearDirty(): void {
    this.dirty = false;
    this.runs.forEach((r) => {
      r.dirty = false;
    });
    this.images.forEach((i) => {
      i.dirty = false;
    });
  }

  findRun(id: string): TextRun | undefined {
    return this.runs.find((r) => r.id === id);
  }

  findImage(id: string): ImageObject | undefined {
    return this.images.find((i) => i.id === id);
  }
}
