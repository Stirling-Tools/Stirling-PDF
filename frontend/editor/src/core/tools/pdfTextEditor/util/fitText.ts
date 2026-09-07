/**
 * Fit browser-laid-out text to the width the PDF actually advances.
 *
 * A PDF's /Widths array overrides the face's own advances, so even with the
 * identical font embedded the browser lays the same string out at a different
 * width - measured at 11-15% out on real files. Whenever the overlay paints
 * visible glyphs over the page bitmap, that difference is the misalignment
 * the user sees.
 */

export interface TextFit {
  /** Px to add to letter-spacing; negative tightens. */
  letterSpacing: number;
  /** Horizontal scale, 1 when tracking alone closed the gap. */
  scaleX: number;
}

export const NO_FIT: TextFit = { letterSpacing: 0, scaleX: 1 };

// Beyond this per-gap adjustment tracking stops reading as tracking and starts
// looking like a different font, so hand over to a scale instead.
const MAX_TRACK_EM = 0.12;
// A ratio outside this band means the inputs disagree about what is being
// measured (wrong line, stale bounds); leave the text alone rather than
// squash it into nonsense.
const MIN_SCALE = 0.5;
const MAX_SCALE = 2;

/**
 * Prefer tracking over scaling: condensing glyphs changes their stroke weight,
 * so a scaled word reads bolder than its neighbours, while tight tracking is
 * close to invisible.
 */
export function fitTextToWidth(
  text: string,
  measuredPx: number,
  targetPx: number,
  fontSizePx: number,
): TextFit {
  if (!text || !Number.isFinite(measuredPx) || !Number.isFinite(targetPx)) {
    return NO_FIT;
  }
  if (measuredPx <= 0 || targetPx <= 0 || fontSizePx <= 0) return NO_FIT;

  const overflow = measuredPx - targetPx;
  // Sub-pixel differences are not worth a style that forces a re-layout.
  if (Math.abs(overflow) <= 0.5) return NO_FIT;

  // Count code points: letter-spacing applies per character, and a surrogate
  // pair is one character to the layout engine.
  const count = [...text].length;
  const perGap = overflow / count;
  if (count > 1 && Math.abs(perGap) <= MAX_TRACK_EM * fontSizePx) {
    return { letterSpacing: -perGap, scaleX: 1 };
  }

  const scale = targetPx / measuredPx;
  if (scale < MIN_SCALE || scale > MAX_SCALE) return NO_FIT;
  return { letterSpacing: 0, scaleX: scale };
}
