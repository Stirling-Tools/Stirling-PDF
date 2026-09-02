import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { ImageObject } from "@app/tools/pdfTextEditor/model/ImageObject";
import { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import type { AnnotationBox } from "@app/tools/pdfTextEditor/model/AnnotationBox";
import type { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PageRuleSnapshot } from "@app/tools/pdfTextEditor/types";

/** Wraps one PDFium page pointer. */
export class Page {
  readonly index: number;
  readonly pagePtr: number;
  readonly width: number;
  readonly height: number;
  // Maps this page's raw PDF object coords (MediaBox, y-up) to the rendered
  // bitmap's display space (CropBox-cropped + /Rotate-applied).
  readonly display: DisplayTransform;
  runs: TextRun[];
  images: ImageObject[];
  /** Text-carrying annotations: rendered by the canvas, not editable. */
  annotations: AnnotationBox[];
  // Bounding boxes of the thin filled/stroked paths the page draws - table
  // rules, underlines, borders. Table recognition snaps its grid onto these so
  // the overlay lands on the lines the reader can see.
  rules: PageRuleSnapshot[];
  /** Filled area boxes (row shading and the like) in page coords. */
  fills: PageRuleSnapshot[];
  // Session tables the editor drew on this page. Not serialized: the PDF keeps
  // only the ruling lines + cell text; this tracks them as an editable grid.
  tables: TableModel[];
  /** True if any object on this page has uncommitted mutation. */
  dirty: boolean;
  /** True if the lazy reader has populated runs/images. */
  loaded: boolean;
  /** Monotonic version counter, bumped on every commit. */
  revision: number;
  // True when commands have mutated PDFium objects on this page but
  // `FPDFPage_GenerateContent` hasn't been called yet.
  needsGenerateContent: boolean;
  // Sticky: regenerated at least once. Regeneration is what drops shadings, so
  // the save-time repair needs this long after `dirty` was cleared.
  regenerated: boolean;

  constructor(opts: {
    index: number;
    pagePtr: number;
    width: number;
    height: number;
    display?: DisplayTransform;
  }) {
    this.index = opts.index;
    this.pagePtr = opts.pagePtr;
    this.width = opts.width;
    this.height = opts.height;
    this.display =
      opts.display ?? DisplayTransform.identity(opts.width, opts.height);
    this.runs = [];
    this.images = [];
    this.annotations = [];
    this.tables = [];
    this.dirty = false;
    this.loaded = false;
    this.revision = 0;
    this.rules = [];
    this.fills = [];
    this.needsGenerateContent = false;
    this.regenerated = false;
  }

  setRuns(runs: TextRun[]): void {
    this.runs = runs;
  }

  setRules(rules: PageRuleSnapshot[]): void {
    this.rules = rules;
  }

  setFills(fills: PageRuleSnapshot[]): void {
    this.fills = fills;
  }

  setImages(images: ImageObject[]): void {
    this.images = images;
  }

  setAnnotations(annotations: AnnotationBox[]): void {
    this.annotations = annotations;
  }

  markDirty(): void {
    this.dirty = true;
    this.revision += 1;
  }

  /** Bump the snapshot revision WITHOUT marking the page dirty. */
  bumpRevision(): void {
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

  // Record that this page's PDFium content stream is stale and needs a future
  // GenerateContent before render or save.
  markNeedsGenerate(): void {
    this.needsGenerateContent = true;
  }

  /** Run `FPDFPage_GenerateContent` if there are pending mutations. */
  flushGenerate(m: WrappedPdfiumModule): void {
    if (!this.needsGenerateContent) return;
    this.needsGenerateContent = false;
    this.regenerated = true;
    // PDFium reports regeneration failure by RETURN VALUE, not by throwing.
    // Discarding it let a page that regenerated to nothing serialize its stale
    // pre-edit stream while the UI reported a clean save. Throwing routes it
    // into PdfiumSave's failedPages guard, which aborts the save.
    if (!m.FPDFPage_GenerateContent(this.pagePtr)) {
      throw new Error(
        `FPDFPage_GenerateContent failed for page ${this.index + 1}`,
      );
    }
  }

  findRun(id: string): TextRun | undefined {
    return this.runs.find((r) => r.id === id);
  }

  findImage(id: string): ImageObject | undefined {
    return this.images.find((i) => i.id === id);
  }
}
