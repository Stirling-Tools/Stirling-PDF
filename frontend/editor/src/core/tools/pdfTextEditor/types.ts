/** Shared types for the PDF text editor. */

import type { DisplayTransformData } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import type { AnnotationBox } from "@app/tools/pdfTextEditor/model/AnnotationBox";

export interface RGBA {
  r: number; // 0..255
  g: number;
  b: number;
  a: number;
}

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type FontStyle = "normal" | "italic";
export type FontWeight = "normal" | "bold";

// How the reader clusters source text objects into editable runs. - "auto": run
// `LineGrouper` then `ParagraphGrouper`.
export type GroupingMode = "auto" | "line";

// How an editable text box grows when its content exceeds the source width:
// "grow" widens to the right.
export type WidthMode = "grow" | "wrap";

export interface FontDescriptor {
  /** Stable id used internally for ref equality */
  id: string;
  family: string;
  style: FontStyle;
  weight: FontWeight;
  /** Whether the font is fully embedded in our bundle */
  bundled: boolean;
}

export interface TextRunSnapshot {
  id: string;
  pageIndex: number;
  bounds: PageRect;
  /** Affine that places the run in page coordinates */
  matrix: Affine;
  text: string;
  fontId: string;
  fontSize: number;
  fill: RGBA;
  /** True if PDFium says the source PDF subsetted this run's font */
  fontSubset: boolean;
  /** PDF text render mode (Tr). 0/absent = normal fill; 3 = invisible. */
  renderMode?: number;
  /** Outline colour, when the run's render mode strokes its glyphs. */
  stroke?: RGBA;
  /** Outline width in PDF points; 0/absent = hairline or unstroked. */
  strokeWidth?: number;
  /** Engine pen origins/ends per code unit; present only while still current. */
  charStartsX?: number[];
  charEndsX?: number[];
  /** Inferred letter-spacing (Tc footprint) in PDF points; 0/absent = none. */
  charSpacingPt?: number;
  /** > 0 when this run represents a multi-line paragraph. */
  paragraphLineHeight?: number;
  /** Member-line count when paragraph (== 1 implies a single line). */
  paragraphLineCount?: number;
  /** Line-slot count; what line alignment actually requires 2 of. */
  paragraphSlotCount?: number;
  paragraphBaselines?: number[];
  paragraphLineLefts?: number[];
  // Editor-only metadata: when true the run cannot be selected or edited via
  // mouse/keyboard.
  locked?: boolean;
}

export interface ImageObjectSnapshot {
  id: string;
  pageIndex: number;
  bounds: PageRect;
  matrix: Affine;
  /** Editor-only: see TextRunSnapshot.locked. */
  locked?: boolean;
}

// One ruling line the page draws, with the ink needed to reproduce it: a table
// the editor takes over has to redraw its grid in the style it found.
export interface PageRuleSnapshot extends PageRect {
  /** PDFium object that drew it; several rules can share one object. */
  ptr: number;
  /** Painted thickness in points. */
  thickness: number;
  color: RGBA;
}

/** How a column's text is set, so new cells match the ones already there. */
export interface TableCellStyle {
  /** Base-14 PostScript name a new text object can actually be built with. */
  family: string;
  fontSize: number;
  fill: RGBA;
  /** Horizontal placement within the cell, read back from the existing text. */
  align: "left" | "right" | "center";
  // Two weights of a non-embedded font report the same substituted face name,
  // so the id is what tells them apart.
  sourceFontId: string;
}

/** One cell of a recognized or inserted table. */
export interface TableCellSnapshot {
  /** Zero-based row index (top-down). */
  row: number;
  /** Zero-based column index (left-to-right). */
  col: number;
  /** Cell rectangle in PDF page coords (y-up, origin bottom-left). */
  rect: PageRect;
  /** Ids of the text runs that sit inside this cell (usually 0 or 1). */
  runIds: string[];
  // Grid columns/rows this cell covers. > 1 when the page draws no boundary
  // between them, i.e. a merged cell. Positions it covers are omitted from
  // `cells` entirely, the way a table markup language omits them.
  colSpan: number;
  rowSpan: number;
}

// A table is a DERIVED view over the page's text runs (plus, for inserted
// tables, drawn ruling lines) - the PDF objects remain the source of truth.
export interface TableSnapshot {
  id: string;
  pageIndex: number;
  rows: number;
  cols: number;
  // Column boundary x positions in PDF points, left-to-right (cols + 1 values).
  colEdges: number[];
  // Row boundary y positions in PDF points, top-to-bottom i.e. DESCENDING y
  // (rows + 1 values).
  rowEdges: number[];
  /** Outer rectangle in PDF page coords (y-up). */
  bounds: PageRect;
  cells: TableCellSnapshot[];
  /** Heuristic confidence 0..1 for a detected table; 1 for an inserted one. */
  confidence: number;
  /** True when the editor drew this table rather than detecting it. */
  synthetic: boolean;
  /** True when the editor owns this table's ruling lines and may redraw them. */
  ruled: boolean;
  // True when the PAGE already draws this grid, so the overlay has no need to
  // outline cells the reader can see the borders of.
  pageRuled: boolean;
  /** True for a grid wrapped around the document's own text (see adoptTable). */
  adopted: boolean;
  /** True for a scan: a picture with invisible OCR text laid over it. */
  scanned: boolean;
  /** Per-column text style, copied from the table's own content. */
  columnStyles: TableCellStyle[];
  /** Style of the header row when it is set differently from the body. */
  headerStyle: TableCellStyle | null;
}

export interface PageSnapshot {
  pageIndex: number;
  width: number;
  height: number;
  /** True when there are uncommitted edits on this page */
  dirty: boolean;
  /** Monotonic counter that increments on every commit. */
  revision: number;
  runs: TextRunSnapshot[];
  images: ImageObjectSnapshot[];
  // Text-carrying annotations: drawn by the canvas, outside the editable
  // object tree. Absent until the page has been read.
  annotations?: AnnotationBox[];
  // Tables the editor drew on this page (synthetic). Recognized tables are
  // derived in the view from `runs`; these are the ones with tracked geometry.
  tables?: TableSnapshot[];
  /** The thin paths the page draws, so a grid can snap onto and adopt them. */
  rules?: PageRuleSnapshot[];
  // Raw-PDF -> display (CropBox/rotation) transform for the screen boundary.
  display: DisplayTransformData;
}

export interface SelectionState {
  runIds: string[];
  /** Selected image object ids. */
  imageIds: string[];
  /** Caret position when exactly one run is selected and the user is typing */
  caret: number | null;
}

export interface ToolbarState {
  fontFamily: string | null;
  fontSize: number | null;
  fill: RGBA | null;
  bold: boolean;
  italic: boolean;
  /**
   * Whether an italic cut is actually reachable for every selected run - a
   * base-14 flip, or an installed face of the run's own family. False disables
   * the control instead of silently substituting Helvetica for the real font.
   */
  canItalic: boolean;
  /** Glyph outline colour across the selection; null when unset or mixed. */
  stroke: RGBA | null;
  /** Glyph outline width in points; null when mixed. 0 means no outline. */
  strokeWidth: number | null;
  /** Mixed-value indicator for multi-select */
  mixed: {
    fontFamily: boolean;
    fontSize: boolean;
    fill: boolean;
    bold: boolean;
    italic: boolean;
    stroke: boolean;
    strokeWidth: boolean;
  };
}
