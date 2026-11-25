interface PagesAreaResize {
  /** The zoom is fit-width or automatic, which follows the area's width. */
  fitting: boolean;
  /** Width of the pages area before the resize began, in CSS pixels. */
  before: number;
  /** Width once the resize settled, in CSS pixels. */
  after: number;
  /** Width of the widest mounted page at the current zoom, in CSS pixels. */
  widestPage: number;
}

/**
 * Whether a settled resize of the pages area should refit the zoom to its width.
 * A page that already overflowed before the area narrowed was zoomed in on
 * purpose, so only a page the narrowing cut off is refitted.
 */
export function shouldRefitOnResize({
  fitting,
  before,
  after,
  widestPage,
}: PagesAreaResize): boolean {
  if (fitting) return true;
  return after < before && widestPage <= before && widestPage > after;
}
