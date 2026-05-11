/**
 * Centralized type definitions for measurement system.
 */

/**
 * Page-relative coordinates with absolute page index.
 */
export interface PagePoint {
  pageIndex: number;
  x: number;
  y: number;
}

/**
 * Scale definition: how many real-world units per PDF point.
 */
export interface MeasureScaleLike {
  factor: number;
  ratio: number | null;
  unit: string;
}

/**
 * Single measurement between two page points.
 * Rejects cross-page measurements (both points must be on same page).
 */
export interface Measurement {
  id: string;
  start: PagePoint;
  end: PagePoint;
}
