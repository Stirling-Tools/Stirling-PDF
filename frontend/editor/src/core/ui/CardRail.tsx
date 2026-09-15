import type {
  CSSProperties,
  ElementType,
  HTMLAttributes,
  ReactNode,
} from "react";
import type { StackGap } from "@app/ui/Stack";
import "@app/ui/CardRail.css";

export interface CardRailProps extends HTMLAttributes<HTMLElement> {
  /** Token-aligned gap between items (maps to `--space-*`). */
  gap?: StackGap;
  /** Fixed width for every item (any CSS length); omit to let items size themselves. */
  itemWidth?: string;
  /** Fixed height for every item; omit for natural height. Equal heights line item footers up. */
  itemHeight?: string;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * A horizontal row of equal-sized items that scrolls sideways rather than wrapping - the "rail" of
 * cards motif (template galleries, tier pickers, at-a-glance strips). The scrolling sibling to
 * {@link Stack} (vertical) and {@link Inline} (horizontal, wraps): it keeps items on one line,
 * contains the overscroll so it doesn't trigger the browser back-gesture, and sizes every child
 * uniformly so their footers align.
 */
export function CardRail({
  gap = "3",
  itemWidth,
  itemHeight,
  as,
  className,
  style,
  children,
  ...rest
}: CardRailProps) {
  const Tag: ElementType = as ?? "div";
  const vars = {
    ...(itemWidth ? { "--sui-card-rail-item-w": itemWidth } : {}),
    ...(itemHeight ? { "--sui-card-rail-item-h": itemHeight } : {}),
    ...style,
  } as CSSProperties;
  const classes = [
    "sui-card-rail",
    `sui-card-rail--gap-${gap}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} style={vars} {...rest}>
      {children}
    </Tag>
  );
}
