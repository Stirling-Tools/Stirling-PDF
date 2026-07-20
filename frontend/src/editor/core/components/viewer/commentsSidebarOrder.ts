/**
 * Compare two sidebar entries by visual position so the list matches the
 * top-to-bottom / left-to-right reading order on the page.
 *
 * EmbedPDF exposes annotation rects in viewport coordinates (top-left origin,
 * y grows downward), so the smaller `origin.y` comes first. A small epsilon on
 * the y comparison treats items on the same row as a tie so they fall back to
 * x-order. Entries without a rect sort to the end while preserving relative
 * order (Array.prototype.sort is stable in modern engines).
 */

export interface CommentEntryLike {
  annotation: {
    object: {
      id?: string;
      rect?: {
        origin?: { x?: number; y?: number };
      };
    };
  };
}

const SAME_ROW_EPSILON_PX = 0.5;

export function compareEntriesByVisualOrder(
  a: CommentEntryLike,
  b: CommentEntryLike,
): number {
  const ra = a.annotation?.object?.rect;
  const rb = b.annotation?.object?.rect;
  if (!ra && !rb) return 0;
  if (!ra) return 1;
  if (!rb) return -1;
  const dy = (ra.origin?.y ?? 0) - (rb.origin?.y ?? 0);
  if (Math.abs(dy) > SAME_ROW_EPSILON_PX) return dy;
  return (ra.origin?.x ?? 0) - (rb.origin?.x ?? 0);
}
