import type { ReactNode } from "react";
import "@shared/components/IconBadge.css";

export type IconBadgeAccent = "blue" | "purple" | "green" | "amber" | "red";

export interface IconBadgeProps {
  children: ReactNode;
  /** Tone tint. Defaults to blue. */
  accent?: IconBadgeAccent;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A glyph in a rounded, tone-tinted square — the recurring "category icon box"
 * motif used by panel headers, summaries and list leads. Centralises the tint
 * so every consumer shares one treatment.
 */
export function IconBadge({
  children,
  accent = "blue",
  size = "md",
  className,
}: IconBadgeProps) {
  return (
    <span
      className={[
        "sui-iconbadge",
        `sui-iconbadge--${accent}`,
        `sui-iconbadge--${size}`,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {children}
    </span>
  );
}
