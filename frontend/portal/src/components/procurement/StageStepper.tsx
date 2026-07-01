import { Fragment } from "react";
import type { DealStage, JourneyStep } from "@portal/api/procurement";

/** Status of a step relative to the deal's current stage. */
type StepState = "complete" | "current" | "upcoming";

/**
 * The five-stage commercial journey as a horizontal band of labelled dots with
 * connectors between them. Purely presentational, the gating action lives in
 * the journey card's next-step row, not on the dots. `locked` greys the whole
 * band for the free/pro upgrade preview, where no stage is current.
 */
export function StageStepper({
  journey,
  currentStage,
  locked = false,
}: {
  journey: JourneyStep[];
  currentStage: DealStage;
  locked?: boolean;
}) {
  const order = journey.map((s) => s.stage);
  const curIdx = locked ? -1 : order.indexOf(currentStage);

  return (
    <div
      className={`portal-proc__steps${locked ? " portal-proc__steps--locked" : ""}`}
    >
      {journey.map((step, i) => {
        const state: StepState =
          i < curIdx ? "complete" : i === curIdx ? "current" : "upcoming";
        return (
          <Fragment key={step.stage}>
            {i > 0 && (
              <span
                className="portal-proc__step-line"
                data-filled={i <= curIdx}
                aria-hidden
              />
            )}
            <div className={`portal-proc__step portal-proc__step--${state}`}>
              <span className="portal-proc__step-dot" aria-hidden />
              <span className="portal-proc__step-label">{step.label}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
