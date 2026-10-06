import { Icon } from "@app/ui/Icon";
import "@app/components/shared/BrandMark.css";

interface BrandMarkProps {
  /** Height of the mark (CSS length). */
  height?: string;
  className?: string;
}

/**
 * The Stirling logo mark, rendered inline (not as an <img>) so its paths can
 * morph. At rest it is the two-tone red brand mark; when an ancestor marked
 * `[data-brandmark-morph]` is hovered / focused / open (`.is-open`), the two
 * parallelograms slide into a smaller downward chevron in the primary text
 * colour — a self-explaining "this opens a menu" affordance. See
 * BrandMark.css for the morph geometry.
 */
export function BrandMark({ height = "1.6rem", className }: BrandMarkProps) {
  return (
    <Icon
      name="stirling-mark"
      size={height}
      className={`sui-brandmark${className ? ` ${className}` : ""}`}
      title="Stirling"
    />
  );
}
