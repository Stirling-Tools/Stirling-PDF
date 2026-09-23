export const THUMB_SIZES = [52, 44, 38, 32, 26, 20];
export const THUMB_GAP = 4;

/**
 * Pick the largest thumbnail size whose wrapped strip still fits the share of
 * the viewport the mobile scanner reserves for it, and the height cap to render
 * that strip at. Keeps the page to one screen with no scrolling at any size.
 */
export function fitThumbs(
  total: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  if (!viewportWidth || !viewportHeight) {
    return { thumbSize: THUMB_SIZES[0], stripMaxHeight: undefined };
  }
  const rowWidth = Math.max(viewportWidth - 24, 80);
  const heightFor = (size: number) => {
    const perRow = Math.max(
      1,
      Math.floor((rowWidth + THUMB_GAP) / (size + THUMB_GAP)),
    );
    return Math.ceil(total / perRow) * (size + THUMB_GAP);
  };
  const preferred = viewportHeight * 0.24;
  const thumbSize =
    THUMB_SIZES.find((size) => heightFor(size) <= preferred) ??
    THUMB_SIZES[THUMB_SIZES.length - 1];
  // Let the strip grow past its usual share rather than hide images, but never
  // far enough to swallow the preview.
  const stripMaxHeight = Math.min(
    Math.max(preferred, heightFor(thumbSize)),
    viewportHeight * 0.45,
  );
  return { thumbSize, stripMaxHeight };
}
