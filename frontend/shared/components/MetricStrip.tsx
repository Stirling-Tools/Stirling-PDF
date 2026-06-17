import type { ReactNode } from "react";
import "@shared/components/MetricStrip.css";

export interface MetricStripProps {
  children: ReactNode;
  className?: string;
}

/**
 * Responsive grid wrapper for a row of {@link MetricCard}s — the prototype's
 * "metric strip" (Home, Sources, Usage, Infrastructure all use it). Four-up on
 * wide screens, two-up below 50rem.
 */
export function MetricStrip({ children, className }: MetricStripProps) {
  return (
    <div
      className={["sui-metric-strip", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
