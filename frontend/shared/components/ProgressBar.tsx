import "@shared/components/ProgressBar.css";

export interface ProgressBarProps {
  /** 0–1. Values outside the range are clamped. */
  value: number;
  /** Height in pixels. Defaults to 6. */
  height?: number;
  /** When set, colour shifts to amber at 80% and red at 96% — the prototype's usage-meter behaviour. */
  thresholded?: boolean;
  /** Optional override colour (CSS gradient or solid). Disables threshold behaviour. */
  color?: string;
  className?: string;
  /** Accessible label for screen readers. */
  label?: string;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Progress bar with optional threshold-based colouring.
 *
 * The prototype's sidebar usage meter uses `thresholded` so the bar turns
 * amber at 80% and red at 96% — a small visual hint that drives upgrade
 * conversion. Pipeline progress / storage bars typically pass a fixed colour.
 */
export function ProgressBar({
  value,
  height = 6,
  thresholded = false,
  color,
  className,
  label,
}: ProgressBarProps) {
  const v = clamp01(value);
  let fill = color;
  if (!fill) {
    if (thresholded) {
      fill =
        v >= 0.96
          ? "linear-gradient(90deg, var(--color-red), #F87171)"
          : v >= 0.8
            ? "linear-gradient(90deg, var(--color-amber), #FBBF24)"
            : "linear-gradient(90deg, var(--color-blue), #60A5FA)";
    } else {
      fill = "linear-gradient(90deg, var(--color-blue), #60A5FA)";
    }
  }
  return (
    <div
      className={["sui-progress", className ?? ""].filter(Boolean).join(" ")}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="sui-progress__fill"
        style={{ width: `${v * 100}%`, background: fill }}
      />
    </div>
  );
}
