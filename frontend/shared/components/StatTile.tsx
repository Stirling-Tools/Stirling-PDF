import type { ReactNode } from "react";
import "@shared/components/StatTile.css";

export type StatTileTone = "default" | "success" | "warning" | "danger";

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** Colours the value (e.g. error rate over threshold). */
  tone?: StatTileTone;
  className?: string;
}

/**
 * Compact label-over-value stat used inside detail panels, cards, and metric
 * grids (the small sibling of {@link MetricCard}). Value uses tabular figures
 * so columns of stats stay aligned.
 */
export function StatTile({
  label,
  value,
  tone = "default",
  className,
}: StatTileProps) {
  return (
    <div className={["sui-stat", className ?? ""].filter(Boolean).join(" ")}>
      <span className="sui-stat__label">{label}</span>
      <span
        className={
          "sui-stat__value" +
          (tone !== "default" ? ` sui-stat__value--${tone}` : "")
        }
      >
        {value}
      </span>
    </div>
  );
}
