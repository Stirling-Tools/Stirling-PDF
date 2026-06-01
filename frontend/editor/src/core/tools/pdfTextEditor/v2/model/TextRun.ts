import type {
  Affine,
  PageRect,
  RGBA,
  TextRunSnapshot,
} from "@app/tools/pdfTextEditor/v2/types";
import { BLACK } from "@app/tools/pdfTextEditor/v2/model/Color";

/**
 * One PDF text object. Mutable inside the editor; commands mutate it,
 * the PdfiumTextWriter is what pushes the change down into PDFium.
 */
export class TextRun {
  readonly id: string;
  readonly pageIndex: number;
  /** PDFium object pointer (page-relative). Zero means "newly created, not yet inserted". */
  pdfiumObjPtr: number;
  bounds: PageRect;
  matrix: Affine;
  text: string;
  fontId: string;
  fontSize: number;
  fill: RGBA;
  fontSubset: boolean;
  /** True when the run has uncommitted mutation. */
  dirty: boolean;
  /**
   * If the LineGrouper merged multiple PDFium objects into this run,
   * the original object pointers (in left-to-right order). On first
   * edit, ReplaceLineGroupCommand removes them all and inserts one
   * fresh text object carrying the merged text.
   */
  mergedFromPtrs: number[];
  /**
   * Per-sub-run text (parallel to `mergedFromPtrs`). Lets the editor
   * map each char in the rep's merged text back to a source sub-object,
   * which the "pure-deletion" optimization uses to remove only the
   * sub-objects whose chars were deleted - preserving the original
   * font's glyphs for everything else.
   */
  mergedFromTexts: string[];
  /**
   * Per-sub-run bounds (parallel to `mergedFromPtrs`). Needed by the
   * pure-deletion path to compute how far to shift surviving sub-runs
   * left when closing a deleted gap.
   */
  mergedFromBounds: Array<{ x: number; right: number }>;
  /**
   * Per-sub-run starting position in `run.text` (parallel to
   * `mergedFromPtrs`). Replaces the prior approach of locating
   * sub-runs via `indexOf` at planPartialEdit time, which broke after
   * an insert split a sub-run's contiguous chars in run.text (the
   * sub-run text "e " could no longer be found because an inserted
   * "r" landed between the 'e' and the space).
   *
   * The char range a sub-run owns in run.text is
   * `[mergedFromCharStarts[i], mergedFromCharStarts[i] + mergedFromTexts[i].length)`.
   * Gaps between consecutive sub-runs' ranges hold LineGrouper-
   * synthesised whitespace that doesn't belong to any PDFium object.
   */
  mergedFromCharStarts: number[];
  /**
   * If this run was extracted from inside a form xobject, the PDFium
   * pointer of the immediate parent form. EditTextCommand uses this to
   * call `FPDFFormObj_RemoveObject(containerPtr, runPtr)` rather than
   * `FPDFPage_RemoveObject` which only works on top-level objects.
   *
   * Zero means "lives directly on the page".
   */
  containerPtr: number;
  /**
   * If the run was extracted from a form xobject, the page-level
   * pointer of the OUTERMOST form so we can also remove merged-group
   * peers that share the same container.
   */
  topLevelContainerPtr: number;
  /**
   * When ParagraphGrouper merged multiple line groups into this run,
   * the average vertical distance between consecutive baselines (in
   * PDF points). Used by the overlay for CSS line-height and by the
   * edit command to compute baselines for re-emitted lines.
   */
  paragraphLineHeight: number;
  /** PDFium pointers for each constituent line, top-down. */
  paragraphMemberPtrs: number[];
  /** Form-xobject containers (parallel array) for each member. */
  paragraphMemberContainers: number[];
  /** Baseline f-values for each member, top-down. */
  paragraphMemberFs: number[];
  /**
   * Every leaf PDFium pointer that backs this paragraph - includes each
   * line's own `mergedFromPtrs` flattened. Used by `EditTextCommand` to
   * remove every original object; `paragraphMemberPtrs` is per-line and
   * misses the LineGrouper sub-members.
   */
  paragraphLeafPtrs: number[];
  /** Parallel form-xobject containers for every leaf ptr. */
  paragraphLeafContainers: number[];

  constructor(
    init: TextRunSnapshot & {
      pdfiumObjPtr: number;
      containerPtr?: number;
      topLevelContainerPtr?: number;
    },
  ) {
    this.id = init.id;
    this.pageIndex = init.pageIndex;
    this.pdfiumObjPtr = init.pdfiumObjPtr;
    this.bounds = init.bounds;
    this.matrix = init.matrix;
    this.text = init.text;
    this.fontId = init.fontId;
    this.fontSize = init.fontSize;
    this.fill = init.fill ?? BLACK;
    this.fontSubset = init.fontSubset;
    this.dirty = false;
    this.mergedFromPtrs = [];
    this.mergedFromTexts = [];
    this.mergedFromBounds = [];
    this.mergedFromCharStarts = [];
    this.containerPtr = init.containerPtr ?? 0;
    this.topLevelContainerPtr = init.topLevelContainerPtr ?? 0;
    this.paragraphLineHeight = 0;
    this.paragraphMemberPtrs = [];
    this.paragraphMemberContainers = [];
    this.paragraphMemberFs = [];
    this.paragraphLeafPtrs = [];
    this.paragraphLeafContainers = [];
  }

  snapshot(): TextRunSnapshot {
    return {
      id: this.id,
      pageIndex: this.pageIndex,
      bounds: { ...this.bounds },
      matrix: { ...this.matrix },
      text: this.text,
      fontId: this.fontId,
      fontSize: this.fontSize,
      fill: { ...this.fill },
      fontSubset: this.fontSubset,
      paragraphLineHeight: this.paragraphLineHeight,
      paragraphLineCount: this.paragraphMemberPtrs.length || undefined,
    };
  }
}
