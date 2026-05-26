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

// Single measurement between two page points on same page
export interface Measurement {
  id: string;
  start: PagePoint;
  end: PagePoint;
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
