/**
 * Z-index constants for layering elements across the application
 * Organized in ascending order to prevent conflicts
 */

export const ZINDEX = {
  // Base layers
  BASE: 0,

  // Overlay/modal layers
  MODAL_BACKDROP: 1000,
  MODAL_CONTENT: 1001,

  // Popover/tooltip layers
  POPOVER: 1100,
  TOOLTIP: 1200,

  // Viewer specific layers
  VIEWER_HIGHLIGHT: 999,
  VIEWER_ANNOTATION_MENU: 1300,

  // Sticky/fixed layers
  STICKY_HEADER: 900,
  STICKY_SIDEBAR: 850,
} as const;
