// Page coordinates with absolute page index
export interface PagePoint {
  pageIndex: number;
  x: number;
  y: number;
}

// Real-world units per PDF point (factor) vs. architectural ratio for display
export interface MeasureScale {
  factor: number; // Real-world units per PDF point
  ratio: number | null; // Architectural ratio (e.g., 100 for "1:100") - display only
  unit: string; // m, cm, mm, km, ft, in, yd, mi
}

export type MeasureScaleLike = MeasureScale;

// Calibration result with full context for audit trail
export interface CalibrationMetadata {
  pdfDistancePts: number; // PDF space distance in points
  realDistance: number; // User-specified real-world distance
  scale: MeasureScale; // Resulting calculated scale
  timestamp: string; // ISO 8601 format
  unitUsed: string; // Unit active during calibration
}

/**
 * distance: exactly two points. perimeter: an open path of two or more points.
 * area: a closed polygon of three or more points; the closing edge is implied.
 */
export type MeasurementKind = "distance" | "perimeter" | "area";

/**
 * A measurement drawn on a single page. Points are in unrotated page space
 * (PDF points, y down from the page top), so they stay accurate at any zoom.
 */
export interface Measurement {
  id: string;
  kind: MeasurementKind;
  points: PagePoint[];
  /** User-given name, shown ahead of the value. */
  label?: string;
  /** Hex colour; written into the PDF when measurements are saved. */
  color?: string;
  /** Stroke width in CSS pixels on screen and PDF points when saved. */
  strokeWidth?: number;
}

// Viewport area with its own scale (for multi-region PDFs)
export interface ViewportScale {
  bbox: [number, number, number, number] | null; // PDF user space or null for entire page
  scale: MeasureScale;
}

// Scale information for a single page with all viewports
export interface PageScaleInfo {
  viewports: ViewportScale[];
  pageHeight: number; // PDF points - used to flip screen-y to PDF-y
}

export type PageMeasureScales = Map<number, PageScaleInfo>;

/**
 * User-set scales for one file. A page entry overrides `defaultScale`, which
 * overrides any scale embedded in the PDF.
 */
export interface FileMeasureScales {
  defaultScale: MeasureScale | null;
  pageScales: Record<number, MeasureScale>;
}

export type MeasurementDisplayUnit = "auto" | string;

export type MeasurementPrecision = "auto" | number;

export type MeasurementLabelVisibility = "hideSmall" | "showAll" | "hideAll";

export interface MeasurementDisplaySettings {
  /** "auto" shows each value in its scale's unit, or paper mm/cm/m unscaled. */
  displayUnit: MeasurementDisplayUnit;
  /** Decimal places; "auto" picks them from the magnitude. */
  precision: MeasurementPrecision;
  labelVisibility: MeasurementLabelVisibility;
  /** Snap to existing points and edges, and show alignment guides. */
  snapToPoints: boolean;
  /** Snap segments to 45-degree steps when drawn close to one. */
  snapToAngles: boolean;
  defaultColor: string;
  defaultStrokeWidth: number;
}
