import "@shared/components/Spinner.css";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Optional accessible label for screen readers. */
  label?: string;
  className?: string;
}

/**
 * Circular spinner. Inherits `currentColor` so it picks up the surrounding
 * text colour — drop it into a Button, a banner, or a code header without
 * any extra styling.
 */
export function Spinner({ size = "md", label, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      aria-busy="true"
      className={["sui-spinner", `sui-spinner--${size}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
