/**
 * Constants and configuration for the crop tool
 */

// Default PDF page sizes in points (1 point = 1/72 inch)
export const PAGE_SIZES = {
  A4: { width: 595, height: 842 },
  LETTER: { width: 612, height: 792 },
  A3: { width: 842, height: 1191 },
  A5: { width: 420, height: 595 },
  LEGAL: { width: 612, height: 1008 },
} as const;

// Minimum crop area dimensions (in points)
export const MIN_CROP_SIZE = {
  width: 10,
  height: 10,
} as const;

// Maximum container size for thumbnail display
export const CROP_CONTAINER_SIZE = 400;

// Crop overlay styling
export const CROP_OVERLAY = {
  borderColor: '#ff4757',
  backgroundColor: 'rgba(255, 71, 87, 0.1)',
  borderWidth: 2,
  handleSize: 8,
  handleColor: '#ff4757',
  handleBorderColor: 'white',
} as const;

// Coordinate precision (decimal places)
export const COORDINATE_PRECISION = 1;

// Default crop area (covers entire page)
export const DEFAULT_CROP_AREA = {
  x: 0,
  y: 0,
  width: PAGE_SIZES.A4.width,
  height: PAGE_SIZES.A4.height,
} as const;

// Resize handle positions
export const RESIZE_HANDLES = [
  'nw', 'ne', 'sw', 'se', // corners
  'n', 'e', 's', 'w'      // edges
] as const;

export type ResizeHandle = typeof RESIZE_HANDLES[number];

// Cursor styles for resize handles
export const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  'nw': 'nw-resize',
  'ne': 'ne-resize',
  'sw': 'sw-resize',
  'se': 'se-resize',
  'n': 'n-resize',
  'e': 'e-resize',
  's': 's-resize',
  'w': 'w-resize',
} as const;
