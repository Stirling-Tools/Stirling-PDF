import type { ElementType, ReactNode, HTMLAttributes } from "react";
import type {
  StackGap,
  StackAlign,
  StackJustify,
} from "@shared/components/Stack";
import "@shared/components/Inline.css";

export interface InlineProps extends HTMLAttributes<HTMLElement> {
  /** Token-aligned gap between children (maps to `--space-*`). */
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  /** Wrap to a new line when children overflow. Defaults to true. */
  wrap?: boolean;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Horizontal flex row with token-aligned gap. Sister to {@link Stack}.
 * Wraps by default — pass `wrap={false}` for a strict single-line layout.
 */
export function Inline({
  gap = "2",
  align = "center",
  justify,
  wrap = true,
  as,
  className,
  children,
  ...rest
}: InlineProps) {
  const Tag: ElementType = as ?? "div";
  const classes = [
    "sui-inline",
    `sui-inline--gap-${gap}`,
    `sui-inline--align-${align}`,
    justify ? `sui-inline--justify-${justify}` : "",
    wrap ? "" : "sui-inline--nowrap",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
