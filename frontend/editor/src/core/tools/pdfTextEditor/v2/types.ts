/**
 * Shared types for the v2 PDF text editor.
 *
 * Plain data shapes only. Model classes live under `model/`.
 */

import type { DisplayTransformData } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";

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

/**
 * How the reader clusters source text objects into editable runs.
 *  - "auto": run `LineGrouper` then `ParagraphGrouper` - vertically
 *    adjacent equal-spaced lines fold into one multi-line paragraph
 *    overlay (word-processor-like editing).
 *  - "line": run `LineGrouper` only - every source line stays a
 *    separate single-line run (closer to the raw PDF structure).
 */
export type GroupingMode = "auto" | "line";

/**
 * How an editable text box grows when its content exceeds the source
 * width: "grow" widens to the right (no wrap); "wrap" keeps the source
 * width and word-wraps, growing downward.
 */
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
  /** > 0 when this run represents a multi-line paragraph. */
  paragraphLineHeight?: number;
  /** Member-line count when paragraph (== 1 implies a single line). */
  paragraphLineCount?: number;
  /**
   * Editor-only metadata: when true the run cannot be selected or
   * edited via mouse/keyboard. Not serialized to the PDF on save;
   * lock is a session-time UX flag (re-opens with all runs unlocked).
   */
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
  /**
   * Raw-PDF -> display (CropBox/rotation) transform for the screen boundary.
   * Plain data; reconstruct a DisplayTransform with `DisplayTransform.fromData`.
   * Identity for normal pages.
   */
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
  /** Mixed-value indicator for multi-select */
  mixed: {
    fontFamily: boolean;
    fontSize: boolean;
    fill: boolean;
    bold: boolean;
    italic: boolean;
  };
}
