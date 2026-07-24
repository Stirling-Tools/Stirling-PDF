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

export interface StatusBadgeProps {
  tone?: StatusTone;
  size?: StatusSize;
  showDot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StatusBadge({
  tone = "neutral",
  size = "md",
  showDot = true,
  children,
  className,
}: StatusBadgeProps) {
  const cls = [
    "sui-status",
    showDot ? "sui-status--dot" : "sui-status--pill",
    `sui-status--${tone}`,
    `sui-status--${size}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {showDot && <span className="sui-status__dot" aria-hidden />}
      <span className="sui-status__label">{children}</span>
    </span>
  );
}
