import type { ReactNode } from "react";
import "@app/ui/Surface.css";
import "@app/ui/MetricStrip.css";

export interface MetricStripProps {
  children: ReactNode;
  layout?: "grid" | "row";
  leading?: ReactNode;
  className?: string;
}

/**
 * Wrapper for a set of {@link MetricCard}s. In the default `grid` layout it's
 * the prototype's four-up "metric strip" (Home, Sources, Usage,
 * Infrastructure). In `row` layout the cards render as inline columns inside a
 * single bordered strip with an optional leading logo/title section.
 */
export function MetricStrip({
  children,
  layout = "grid",
  leading,
  className,
}: MetricStripProps) {
  const classes = [
    layout === "row" ? "sui-surface" : "",
    "sui-metric-strip",
    `sui-metric-strip--${layout}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      {layout === "row" && leading != null && (
        <div className="sui-metric-strip__leading">{leading}</div>
      )}
      {children}
    </div>
  );
}
