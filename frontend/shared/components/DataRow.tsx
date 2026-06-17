import type { ReactNode } from "react";
import "@shared/components/DataRow.css";

export interface DataRowProps {
  /** Left-aligned key. */
  label: ReactNode;
  /** Value — text, chips, or any node. */
  children: ReactNode;
  /** Fixed key-column width (CSS length). Defaults to 4.5rem. */
  labelWidth?: string;
  /** Vertical alignment of label vs value. `top` suits multi-line values. */
  align?: "center" | "top";
  className?: string;
}

/**
 * A key/value row for read-only detail/summary read-outs (a single line of a
 * description list). Compose several inside a Card. Use `align="top"` when the
 * value wraps (e.g. a chip flow).
 */
export function DataRow({
  label,
  children,
  labelWidth = "4.5rem",
  align = "center",
  className,
}: DataRowProps) {
  return (
    <div
      className={["sui-datarow", `sui-datarow--${align}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="group"
    >
      <span className="sui-datarow__label" style={{ width: labelWidth }}>
        {label}
      </span>
      <div className="sui-datarow__value">{children}</div>
    </div>
  );
}
