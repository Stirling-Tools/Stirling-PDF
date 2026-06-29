import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import "@shared/components/SegmentedControl.css";

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
  /** Disables the whole control. */
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Single-select control with a sliding highlight (Mantine-backed). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent = "default",
  size = "md",
  variant = "primary",
  fullWidth = false,
  loading = false,
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

  // Drive Mantine's indicator/label colour vars from the accent palette.
  const accentVars =
    variant === "primary"
      ? { "--sc-color": "var(--_solid)", "--sc-label-color": "var(--_on)" }
      : { "--sc-color": "var(--_tint)", "--sc-label-color": "var(--_text)" };

  return (
    <MantineSegmentedControl
      className={classes}
      style={{ ...(accentVars as CSSProperties), ...style }}
      data={options.map((o) => ({
        label: o.label,
        value: o.value,
        disabled: o.disabled,
      }))}
      value={value}
      onChange={(v) => onChange(v as T)}
      size={size}
      fullWidth={fullWidth}
      disabled={loading}
    />
  );
}
