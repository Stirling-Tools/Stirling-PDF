import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import { CONTROL_HEIGHT } from "@app/ui/controlSizes";
import "@app/ui/SegmentedControl.css";

/** Same accent dial as Button. Only the active segment is accented. */
export type SegmentedAccent =
  | "default"
  | "neutral"
  | "brand"
  | "ai"
  | "premium"
  | "danger"
  | "success"
  | "warning";
export type SegmentedSize = "xs" | "sm" | "md" | "lg";
/** primary = accent-filled active pill; secondary = subtle tinted pill, no track chrome. */
export type SegmentedVariant = "primary" | "secondary";

// Overall height, in sync with Button/ActionIcon via CONTROL_HEIGHT (xs is segmented-only).
const SEG_HEIGHT: Record<SegmentedSize, string> = {
  xs: "26px",
  sm: CONTROL_HEIGHT.sm,
  md: CONTROL_HEIGHT.md,
  lg: CONTROL_HEIGHT.lg,
};

export interface SegmentedOption<T extends string> {
  label: ReactNode;
  value: T;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: SegmentedAccent;
  size?: SegmentedSize;
  variant?: SegmentedVariant;
  fullWidth?: boolean;
  disabled?: boolean;
  /** Alias of `disabled`; also disables the control. */
  loading?: boolean;
  /** Accessible name for the radiogroup. */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/** Single-select control with a sliding highlight (Mantine-backed). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent = "default",
  size = "sm",
  variant = "primary",
  fullWidth = false,
  disabled = false,
  loading = false,
  ariaLabel,
  className,
  style,
}: SegmentedControlProps<T>) {
  const classes = [
    "sui-seg",
    `sui-acc-${accent}`,
    `sui-seg--${variant}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const accentVars =
    variant === "secondary"
      ? { "--sc-color": "var(--_tint)", "--sc-label-color": "var(--_text)" }
      : {};

  return (
    <MantineSegmentedControl
      className={classes}
      style={{
        ...(accentVars as CSSProperties),
        // Fixed height (matches Button/ActionIcon per size); CSS fills the labels.
        height: SEG_HEIGHT[size],
        ...style,
      }}
      data={options.map((o) => ({
        label: o.label,
        value: o.value,
        disabled: o.disabled,
      }))}
      value={value}
      onChange={(v) => onChange(v as T)}
      size={size}
      fullWidth={fullWidth}
      disabled={disabled || loading}
      aria-label={ariaLabel}
    />
  );
}
