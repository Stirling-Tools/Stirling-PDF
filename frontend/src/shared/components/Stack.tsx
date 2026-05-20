import type { ElementType, ReactNode, HTMLAttributes } from "react";
import "@shared/components/Stack.css";

export type StackGap =
  | "0"
  | "0_5"
  | "1"
  | "1_5"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "8";

export type StackAlign = "stretch" | "start" | "center" | "end" | "baseline";
export type StackJustify =
  | "start"
  | "center"
  | "end"
  | "between"
  | "around"
  | "evenly";

export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Token-aligned gap between children (maps to `--space-*`). */
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  /** Stretch to fill parent height. */
  fill?: boolean;
  /** Render as a custom element (defaults to div). */
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Vertical flex column with token-aligned gap. Replaces inline
 * `style={{ display: 'flex', flexDirection: 'column', gap: ... }}` everywhere.
 */
export function Stack({
  gap = "2",
  align,
  justify,
  fill,
  as,
  className,
  children,
  ...rest
}: StackProps) {
  const Tag: ElementType = as ?? "div";
  const classes = [
    "sui-stack",
    `sui-stack--gap-${gap}`,
    align ? `sui-stack--align-${align}` : "",
    justify ? `sui-stack--justify-${justify}` : "",
    fill ? "sui-stack--fill" : "",
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
