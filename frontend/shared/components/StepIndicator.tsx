import "@shared/components/StepIndicator.css";

export interface StepIndicatorProps {
  /** Total number of steps. */
  total: number;
  /** Current step, 1-based. */
  current: number;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A segmented step/progress rail for multi-step flows (wizards, onboarding).
 * Segments before `current` read as completed, the `current` segment is
 * emphasised, and the rest are upcoming.
 */
export function StepIndicator({
  total,
  current,
  size = "md",
  className,
}: StepIndicatorProps) {
  return (
    <div
      className={["sui-steps", `sui-steps--${size}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const state =
          step < current ? "done" : step === current ? "current" : "upcoming";
        return (
          <span key={step} className="sui-steps__bar" data-state={state} />
        );
      })}
    </div>
  );
}
