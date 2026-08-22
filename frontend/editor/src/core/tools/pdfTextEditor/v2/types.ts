/** Shared types for the v2 PDF text editor. */

import type { DisplayTransformData } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";
import type { AnnotationBox } from "@app/tools/pdfTextEditor/v2/model/AnnotationBox";

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
