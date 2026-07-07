import type { HTMLAttributes, ReactNode } from "react";
import "@app/ui/Card.css";

/** Subset of the shared accent dial that has a styled strip (see Card.css). */
export type CardAccent =
  | "default"
  | "premium"
  | "danger"
  | "success"
  | "warning";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds an accent strip on the left edge of the card. */
  accent?: CardAccent;
  /**
   * Padding profile. `tight` = 0.75rem, `default` = 1.125rem, `loose` = 1.5rem.
   * `none` removes padding so the card surface can host edge-to-edge content
   * (e.g. a list with row dividers).
   */
  padding?: "none" | "tight" | "default" | "loose";
  /** Use the lifted surface treatment (taller shadow, hover affordance). */
  interactive?: boolean;
  children?: ReactNode;
}

/**
 * Generic surface — the prototype's cardStyle / cardStyleSm helper, lifted
 * into a primitive. Any list item, panel, or detail card that needs the
 * standard surface treatment composes from here.
 */
export function Card({
  accent,
  padding = "default",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={[
        "sui-card",
        `sui-card--pad-${padding}`,
        accent ? `sui-card--accent-${accent}` : "",
        interactive ? "sui-card--interactive" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
