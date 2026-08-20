interface BrandTileProps {
  /**
   * Height and width (CSS length). Omit to let a caller's CSS size it - the
   * portal's editor hero fills its container that way.
   */
  size?: string;
  className?: string;
}

/**
 * The Stirling app tile: the brand mark knocked out of a rounded, brand-coloured
 * square. Distinct from {@link BrandMark}, which is the bare two-tone mark - this
 * is the "an app you can open" lockup, used beside the editor's name and as the
 * editor's entry in the quick nav rail.
 *
 * Decorative: every call site sits inside something that already carries the
 * accessible name (a heading, a labelled button).
 */
export function BrandTile({ size, className }: BrandTileProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 256 256"
      fill="none"
      style={size ? { width: size, height: size } : undefined}
      aria-hidden
    >
      <rect width="256" height="256" rx="58" fill="var(--c-brand-mark)" />
      <path
        d="M39.2638 127.834L155.374 32L155.375 121.499L39.2638 217.333L39.2638 127.834Z"
        fill="white"
      />
      <path
        d="M159 124.5L159 88.5L216.728 38.4472L216.728 128.052L100.479 224L100.479 172L159 124.5Z"
        fill="white"
        fillOpacity="0.6"
      />
    </svg>
  );
}
