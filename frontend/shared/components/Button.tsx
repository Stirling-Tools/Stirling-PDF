import type { ButtonHTMLAttributes, ReactNode } from "react";
import "@shared/components/Button.css";

export type ButtonVariant = "gradient" | "outline" | "ghost";
export type ButtonSize = "sm" | "md";
export type ButtonAccent = "blue" | "purple" | "green" | "amber" | "red";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. `gradient` is the primary CTA; `outline` is secondary; `ghost` is tertiary/text. */
  variant?: ButtonVariant;
  /** Optional accent colour. Currently affects `gradient` and `outline` variants. */
  accent?: ButtonAccent;
  size?: ButtonSize;
  /** Icon node rendered before the label. */
  leadingIcon?: ReactNode;
  /** Icon node rendered after the label (arrow → for "next" CTAs). */
  trailingIcon?: ReactNode;
  /** Show a spinner and disable interactivity. */
  loading?: boolean;
  /** Stretches to fill its parent container. */
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * Stirling's two-button system: a gradient primary CTA and an outlined
 * secondary action. Ghost is reserved for tertiary links inside a row.
 *
 * Buttons compose with the existing CSS variables — they re-skin cleanly in
 * dark mode without per-variant overrides.
 */
export function Button({
  variant = "gradient",
  accent = "blue",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "sui-btn",
    `sui-btn--${variant}`,
    `sui-btn--${accent}`,
    `sui-btn--${size}`,
    fullWidth ? "sui-btn--full" : "",
    loading ? "sui-btn--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...rest} disabled={disabled || loading} className={classes}>
      {loading ? (
        <span className="sui-btn__spinner" aria-hidden />
      ) : (
        leadingIcon
      )}
      {children && <span className="sui-btn__label">{children}</span>}
      {!loading && trailingIcon}
    </button>
  );
}
