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

/**
 * Page editor spreading animation constants
 * Used for fileEditor ↔ pageEditor transitions
 */
export const PAGE_EDITOR_TRANSITION = {
  /** Duration of spreading animation in milliseconds */
  SPREAD_DURATION: 400,

  /** Stagger delay between individual page animations in milliseconds */
  PAGE_STAGGER_DELAY: 30,

  /** Maximum total stagger delay in milliseconds */
  MAX_TOTAL_STAGGER: 300,

  /** Cubic bezier easing function (matches viewer) */
  EASING: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',

  /** Z-index for transition overlay (above viewer transition) */
  OVERLAY_Z_INDEX: 10001,

  /** Maximum pages to animate individually (performance threshold) */
  MAX_ANIMATED_PAGES: 100,

  /** Event name fired when glide animation completes */
  GLIDE_COMPLETE_EVENT: 'page-editor-glide-complete',
} as const;
