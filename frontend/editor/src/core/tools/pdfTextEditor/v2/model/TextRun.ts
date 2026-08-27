import type {
  Affine,
  PageRect,
  RGBA,
  TextRunSnapshot,
} from "@app/tools/pdfTextEditor/v2/types";

/** One line's worth of sub-run data inside a paragraph. */
export interface ParagraphLineSlot {
  startChar: number;
  endChar: number;
  baselineY: number;
  matrixE: number;
  containerPtr: number;
  fontId: string;
  fontSize: number;
  fontSubset: boolean;
  mergedFromPtrs: number[];
  mergedFromTexts: string[];
  mergedFromBounds: Array<{ x: number; right: number }>;
  /** Char-start positions RELATIVE to the line's text (0..lineText.length). */
  mergedFromCharStarts: number[];
}

/** Deep-clone a slot so the copy shares NO nested arrays with the source. */
export function cloneParagraphLineSlot(
  s: ParagraphLineSlot,
): ParagraphLineSlot {
  return {
    ...s,
    mergedFromPtrs: [...s.mergedFromPtrs],
    mergedFromTexts: [...s.mergedFromTexts],
    mergedFromBounds: s.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...s.mergedFromCharStarts],
  };
}

/** One PDF text object. */
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
  // PDF text render mode (Tr): 0 fill, 1/2 stroke variants, 3 invisible (OCR
  // layers over scans), 4-7 clipping.
  renderMode: number;
  // Glyph outline (PDF stroke state), carried even when the render mode hides
  // it, so a re-emit cannot silently drop an outlined heading's outline.
  stroke: RGBA | null;
  strokeWidth: number;
  // Engine pen origins/ends per code unit of `text`, raw page points. Valid
  // only while `charPositionsText` still equals `text`, so edits invalidate.
  charStartsX: number[] | null;
  charEndsX: number[] | null;
  charPositionsKey: string | null;
  /** Effective extra advance per glyph in PDF points. */
  charSpacingPt: number;
  /** True when the run has uncommitted mutation. */
  dirty: boolean;
  // If the LineGrouper merged multiple PDFium objects into this run, the
  // original object pointers (in left-to-right order).
  mergedFromPtrs: number[];
  /** Per-sub-run text (parallel to `mergedFromPtrs`). */
  mergedFromTexts: string[];
  /** Per-sub-run bounds (parallel to `mergedFromPtrs`). */
  mergedFromBounds: Array<{ x: number; right: number }>;
  // Per-sub-run starting position in `run.text` (parallel to `mergedFromPtrs`).
  mergedFromCharStarts: number[];
  // If this run was extracted from inside a form xobject, the PDFium pointer of
  // the immediate parent form.
  containerPtr: number;
  /** If the run was extracted from a form xobject. */
  topLevelContainerPtr: number;
  // When ParagraphGrouper merged multiple line groups into this run, the
  // average vertical distance between consecutive baselines (in PDF points).
  paragraphLineHeight: number;
  /** PDFium pointers for each constituent line, top-down. */
  paragraphMemberPtrs: number[];
  /** Form-xobject containers (parallel array) for each member. */
  paragraphMemberContainers: number[];
  /** Baseline f-values for each member, top-down. */
  paragraphMemberFs: number[];
  // Every leaf PDFium pointer that backs this paragraph - includes each line's
  // own `mergedFromPtrs` flattened.
  paragraphLeafPtrs: number[];
  /** Parallel form-xobject containers for every leaf ptr. */
  paragraphLeafContainers: number[];
  // Pointer to the LATEST background cover-rect emitted on the page for this
  // run.
  coverRectPtr: number;
  /** Per-line sub-run snapshots for paragraph-aware partial edits. */
  paragraphLineSlots: ParagraphLineSlot[];
  // Which visual lines start at a break the WRAP put there rather than one the
  // user typed. run.text spells both as a newline - it has to, or the line
  // count the painter and the box height read disagrees with the ink on the
  // page - so the difference lives here. Without it a reflow re-reads its own
  // soft breaks as forced ones and the paragraph can never re-flow again.
  paragraphSoftStarts: boolean[];
  // Session-only lock: when true the run is skipped by all hit-tests (mouse,
  // marquee, Ctrl+A) and edit gestures are no-ops.
  locked: boolean;

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
    this.fill = init.fill;
    this.fontSubset = init.fontSubset;
    this.renderMode = init.renderMode ?? 0;
    this.stroke = init.stroke ?? null;
    this.strokeWidth = init.strokeWidth ?? 0;
    this.charStartsX = null;
    this.charEndsX = null;
    this.charPositionsKey = null;
    this.charSpacingPt = 0;
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
    this.paragraphLineSlots = [];
    this.paragraphSoftStarts = [];
    this.coverRectPtr = 0;
    this.locked = init.locked ?? false;
  }

  // Captured pen positions are only valid for the text AND face they were
  // measured from; a size or family change moves every glyph.
  positionsKey(): string {
    return `${this.text}\u0000${this.fontId}\u0000${this.fontSize}`;
  }

  private positionsCurrent(): boolean {
    return this.charPositionsKey === this.positionsKey();
  }

  // Display/serialization projection only.
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
      renderMode: this.renderMode || undefined,
      stroke: this.stroke ? { ...this.stroke } : undefined,
      strokeWidth: this.strokeWidth || undefined,
      charStartsX: this.positionsCurrent()
        ? (this.charStartsX ?? undefined)
        : undefined,
      charEndsX: this.positionsCurrent()
        ? (this.charEndsX ?? undefined)
        : undefined,
      charSpacingPt: this.charSpacingPt || undefined,
      paragraphLineHeight: this.paragraphLineHeight,
      paragraphLineCount: this.paragraphMemberPtrs.length || undefined,
      paragraphSlotCount: this.paragraphLineSlots.length || undefined,
      paragraphBaselines: this.lineBaselines(),
      paragraphLineLefts: this.lineLefts(),
      locked: this.locked || undefined,
    };
  }

  private lineBaselines(): number[] | undefined {
    if (this.paragraphLineSlots.length > 0) {
      return this.paragraphLineSlots.map((s) => s.baselineY);
    }
    return this.paragraphMemberFs.length > 0
      ? [...this.paragraphMemberFs]
      : undefined;
  }

  private lineLefts(): number[] | undefined {
    return this.paragraphLineSlots.length > 0
      ? this.paragraphLineSlots.map((s) => s.matrixE)
      : undefined;
  }
}
