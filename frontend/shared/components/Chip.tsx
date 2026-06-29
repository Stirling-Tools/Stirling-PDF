import { Pill as MantinePill } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import "@shared/components/Chip.css";

/** Same accent dial as Button. */
export type ChipAccent =
  | "default"
  | "neutral"
  | "brand"
  | "ai"
  | "premium"
  | "danger"
  | "success"
  | "warning";
export type ChipSize = "xs" | "sm" | "md" | "lg";
/** primary = solid fill; secondary = soft tinted tag (the default tag look). */
export type ChipVariant = "primary" | "secondary";

export interface ChipProps {
  accent?: ChipAccent;
  variant?: ChipVariant;
  size?: ChipSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Shows a spinner and dims the chip. */
  loading?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  /** Leading status dot. Use for status-style chips. */
  showDot?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
  className?: string;
  "data-consolidate-as"?: string;
}

/** Open-ended chip/tag (Mantine Pill-backed). For semantic status use StatusBadge. */
export function Chip({
  accent = "default",
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading = false,
  onRemove,
  onClick,
  showDot,
  style,
  children,
  className,
  ...rest
}: ChipProps) {
  const classes = [
    "sui-chip",
    `sui-acc-${accent}`,
    `sui-chip--${variant}`,
    onClick ? "sui-chip--interactive" : "",
    loading ? "sui-chip--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <MantinePill
      {...rest}
      className={classes}
      style={style}
      size={size}
      withRemoveButton={!!onRemove && !loading}
      onRemove={onRemove}
      onClick={loading ? undefined : onClick}
      {...(onClick ? { role: "button", tabIndex: 0 } : {})}
    >
      {showDot && <span className="sui-chip__dot" aria-hidden />}
      {loading ? (
        <span className="sui-chip__spinner" aria-hidden />
      ) : leadingIcon ? (
        <span className="sui-chip__icon" aria-hidden>
          {leadingIcon}
        </span>
      ) : null}
      <span className="sui-chip__label">{children}</span>
      {trailingIcon && !onRemove && (
        <span className="sui-chip__icon" aria-hidden>
          {trailingIcon}
        </span>
      )}
    </MantinePill>
  );
}
