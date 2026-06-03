import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

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
  /**
   * True when commands have mutated PDFium objects on this page but
   * `FPDFPage_GenerateContent` hasn't been called yet. Flipped to true
   * by `markNeedsGenerate()`; flipped back to false by `flushGenerate()`.
   *
   * GenerateContent re-serialises the page's in-memory object graph back
   * into the content stream. Object mutations (SetText / Transform /
   * Remove / Insert / SetFillColor) take effect on the object graph
   * immediately - GenerateContent is only required before paths that
   * READ the content stream: `FPDF_RenderPageBitmap`, `FPDFText_LoadPage`,
   * and the save path. Deferring it lets a burst of keystrokes regenerate
   * exactly once at the next render / save, instead of once per char.
   */
  needsGenerateContent: boolean;

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
    this.needsGenerateContent = false;
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

  /**
   * Record that this page's PDFium content stream is stale and needs a
   * future GenerateContent before render or save. Cheap; callers do this
   * instead of `FPDFPage_GenerateContent(pagePtr)` directly so a burst
   * of mutations only triggers one regeneration at flush time.
   */
  markNeedsGenerate(): void {
    this.needsGenerateContent = true;
  }

  /**
   * Run `FPDFPage_GenerateContent` if there are pending mutations.
   * Idempotent: a no-op when nothing changed since the last flush.
   * Call sites: bitmap render, text-page load, save.
   */
  flushGenerate(m: WrappedPdfiumModule): void {
    if (!this.needsGenerateContent) return;
    this.needsGenerateContent = false;
    m.FPDFPage_GenerateContent(this.pagePtr);
  }

  findRun(id: string): TextRun | undefined {
    return this.runs.find((r) => r.id === id);
  }

  findImage(id: string): ImageObject | undefined {
    return this.images.find((i) => i.id === id);
  }
}
