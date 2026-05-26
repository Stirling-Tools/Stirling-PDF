import type { ReactNode } from "react";
import "@shared/components/Chip.css";

export type ChipTone =
  | "neutral"
  | "blue"
  | "purple"
  | "green"
  | "amber"
  | "red";

export type ChipSize = "sm" | "md";

export interface ChipProps {
  tone?: ChipTone;
  size?: ChipSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Show a `×` button. Calls `onRemove` when clicked. */
  onRemove?: () => void;
  /** Renders as a button when set. */
  onClick?: () => void;
  /** Show the leading dot affordance. Defaults to false (set true for status-style chips). */
  showDot?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Generic chip / tag — `StatusBadge` has a fixed taxonomy (success/warning/…),
 * `MethodBadge` is HTTP-method-only; this is the open-ended one for tag rows
 * (selected ops, document regions, kbd hints, sort chips, etc).
 */
export function Chip({
  tone = "neutral",
  size = "md",
  leadingIcon,
  trailingIcon,
  onRemove,
  onClick,
  showDot,
  children,
  className,
}: ChipProps) {
  const Tag = onClick ? "button" : "span";
  const classes = [
    "sui-chip",
    `sui-chip--${tone}`,
    `sui-chip--${size}`,
    onClick ? "sui-chip--interactive" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag
      className={classes}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      {showDot && <span className="sui-chip__dot" aria-hidden />}
      {leadingIcon && (
        <span className="sui-chip__icon" aria-hidden>
          {leadingIcon}
        </span>
      )}
      <span className="sui-chip__label">{children}</span>
      {trailingIcon && !onRemove && (
        <span className="sui-chip__icon" aria-hidden>
          {trailingIcon}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="sui-chip__remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </Tag>
  );
}
