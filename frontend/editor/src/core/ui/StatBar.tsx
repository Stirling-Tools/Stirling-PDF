import type { ReactNode } from "react";
import "@app/ui/StatBar.css";

export type StatBarTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatBarItemProps {
  children: ReactNode;
  /** Lead-fact treatment: darker + semibold. Usually the first item. */
  emphasis?: boolean;
  tone?: StatBarTone;
  /** Tooltip carrying the fact's longer explanation. */
  title?: string;
  /** Makes the fact clickable (e.g. filters the table below). */
  onClick?: () => void;
  className?: string;
}

/** One fact in a {@link StatBar}. Clickable facts render as real buttons. */
export function StatBarItem({
  children,
  emphasis = false,
  tone = "neutral",
  title,
  onClick,
  className,
}: StatBarItemProps) {
  const cls = [
    "sui-statbar__item",
    `sui-statbar__item--${tone}`,
    emphasis ? "sui-statbar__item--emphasis" : "",
    onClick ? "sui-statbar__item--link" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  if (onClick) {
    return (
      <button type="button" className={cls} title={title} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

export interface StatBarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Thin one-row facts bar — the toned-down replacement for a row of
 * {@link MetricCard} boxes on list surfaces (Sources, Pipelines, Policies).
 * Facts are {@link StatBarItem}s: the lead fact carries emphasis, the rest
 * stay muted, and attention facts take a tone and an optional click-through.
 */
export function StatBar({ children, className }: StatBarProps) {
  return (
    <div className={["sui-statbar", className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
