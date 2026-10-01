import "@app/components/shared/BrandMark.css";

interface BrandMarkProps {
  /** Height of the mark (CSS length). */
  height?: string;
  className?: string;
}

/**
 * The Stirling logo mark as inline SVG so it can morph. At rest it is the
 * two-tone red brand mark; when an ancestor marked `[data-brandmark-morph]` is
 * hovered / focused / open (`.is-open`), the two parallelograms slide into a
 * smaller downward chevron in the primary text colour — a self-explaining
 * "this opens a menu" affordance. See BrandMark.css for the morph geometry.
 */
export function BrandMark({ height = "1.6rem", className }: BrandMarkProps) {
  return (
    <svg
      className={`sui-brandmark${className ? ` ${className}` : ""}`}
      viewBox="0 0 71 79"
      style={{ height }}
      role="img"
      aria-label="Stirling"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="sui-brandmark__a"
        d="M0 39 L46.5 0 L46.5 35.5 L0 74.5 Z"
      />
      <path
        className="sui-brandmark__b"
        d="M24 43 L70.5 4 L70.5 39.5 L24 78.5 Z"
      />
    </svg>
  );
}
