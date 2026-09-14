/**
 * Lane geometry. Single source of truth: the numbers are pushed onto the track
 * element as CSS custom properties AND used by the horizontal virtualiser, so
 * the two can never drift apart.
 */
export const TRACK_GEOMETRY = {
  tileWidthRem: 8.5,
  tileCanvasHeightRem: 11.5,
  tileFooterHeightRem: 1.375,
  gapRem: 0.5,
  /** Extra tiles rendered either side of the visible window. */
  overscan: 6,
} as const;

export const rootFontSizePx = (): number => {
  if (typeof window === "undefined") return 16;
  const parsed = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isNaN(parsed) ? 16 : parsed;
};
