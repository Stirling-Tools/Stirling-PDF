/**
 * Shared animation constants for viewer transitions
 * Single source of truth for timing and easing across CSS and JS
 */

export const VIEWER_TRANSITION = {
  /** Duration of zoom animation in milliseconds */
  ZOOM_DURATION: 400,

  /** Duration of screenshot fade in milliseconds */
  SCREENSHOT_FADE_DURATION: 200,

  /** Cubic bezier easing function (easeOutQuad) */
  EASING: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',

  /** Z-index for transition overlays */
  OVERLAY_Z_INDEX: 10000,
} as const;
