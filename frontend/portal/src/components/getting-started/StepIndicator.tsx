/**
 * Horizontal progress rail across the top of the funnel. Purely presentational
 * — the parent owns `current`; clicking a completed step lets the user jump
 * back, which is why `onStepClick` only fires for already-visited steps.
 */
export interface StepIndicatorProps {
  steps: string[];
  /** Zero-based index of the active step. */
  current: number;
  /** Fired when a completed (earlier) step is clicked. */
  onStepClick?: (index: number) => void;
}

export function StepIndicator({
  steps,
  current,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <ol className="portal-gs__steps">
      {steps.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const canJump = isDone && onStepClick !== undefined;
        return (
          <li
            key={label}
            className={
              "portal-gs__step" +
              (isActive ? " is-active" : isDone ? " is-done" : "")
            }
          >
            <button
              type="button"
              className="portal-gs__step-btn"
              // Only completed steps are navigable; the current and future
              // steps stay inert so users can't skip ahead past validation.
              disabled={!canJump}
              aria-current={isActive ? "step" : undefined}
              onClick={canJump ? () => onStepClick(i) : undefined}
            >
              <span className="portal-gs__step-mark">
                {isDone ? "✓" : i + 1}
              </span>
              <span className="portal-gs__step-label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
