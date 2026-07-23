import type { ReactNode } from "react";
import "@app/ui/StatusBadge.css";

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

export type StatusSize = "sm" | "md" | "lg";

/** `pill` is the filled badge; `subtle` is the toned-down dot + plain text. */
export type StatusVariant = "pill" | "subtle";

export interface StatusBadgeProps {
  tone?: StatusTone;
  size?: StatusSize;
  variant?: StatusVariant;
  /** Show a leading coloured dot. */
  showDot?: boolean;
  /** Render the dot with a pulse animation (active / live indicator). */
  pulse?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Inline status pill used across surfaces — pipeline rows, document status,
 * deployments, audit logs. Tone maps to semantic meaning, not raw colour.
 */
export function StatusBadge({
  tone = "neutral",
  size = "md",
  variant = "pill",
  showDot = true,
  pulse = false,
  children,
  className,
}: StatusBadgeProps) {
  const cls = [
    "sui-status",
    `sui-status--${tone}`,
    `sui-status--${size}`,
    variant === "subtle" ? "sui-status--subtle" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {showDot && (
        <span
          className={`sui-status__dot${pulse ? " sui-status__dot--pulse" : ""}`}
          aria-hidden
        />
      )}
      <span className="sui-status__label">{children}</span>
    </span>
  );
}
