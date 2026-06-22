import { Button, Card, StatusBadge } from "@shared/components";
import type { DealStage, JourneyStep } from "@portal/api/procurement";

/** Status of a step relative to the deal's current stage. */
type StepState = "complete" | "current" | "upcoming";

function stepState(
  stepStage: DealStage,
  currentStage: DealStage,
  order: DealStage[],
): StepState {
  const at = order.indexOf(currentStage);
  const here = order.indexOf(stepStage);
  if (here < at) return "complete";
  if (here === at) return "current";
  return "upcoming";
}

/**
 * The five-stage commercial journey rendered as a horizontal stepper. The
 * current stage is highlighted and surfaces its one gating action; the terminal
 * `active` stage shows provisioning rather than a CTA.
 *
 * When `locked`, the stepper renders as a greyed, non-interactive preview
 * behind the upgrade prompt — free/pro buyers see the path without the deal.
 */
export function DealStepper({
  journey,
  currentStage,
  locked = false,
  onAdvance,
  advancing = false,
}: {
  journey: JourneyStep[];
  currentStage: DealStage;
  locked?: boolean;
  onAdvance?: (stage: DealStage) => void;
  advancing?: boolean;
}) {
  const order = journey.map((s) => s.stage);

  return (
    <Card
      padding="loose"
      className={`portal-proc__stepper${locked ? " portal-proc__stepper--locked" : ""}`}
    >
      <ol className="portal-proc__steps">
        {journey.map((step, i) => {
          const state = locked
            ? "upcoming"
            : stepState(step.stage, currentStage, order);
          const isTerminal = i === journey.length - 1;
          return (
            <li
              key={step.stage}
              className={`portal-proc__step portal-proc__step--${state}`}
            >
              <div className="portal-proc__step-marker" aria-hidden>
                {state === "complete" ? "✓" : i + 1}
              </div>
              <div className="portal-proc__step-body">
                <div className="portal-proc__step-head">
                  <span className="portal-proc__step-label">{step.label}</span>
                  {state === "current" && !locked && (
                    <StatusBadge tone="purple" size="sm" pulse>
                      Current
                    </StatusBadge>
                  )}
                </div>
                <p className="portal-proc__step-blurb">{step.blurb}</p>
                {state === "current" && !locked && (
                  <div className="portal-proc__step-action">
                    {isTerminal ? (
                      <span className="portal-proc__step-provisioning">
                        {step.gatingAction}…
                      </span>
                    ) : (
                      <Button
                        variant="gradient"
                        accent="purple"
                        size="sm"
                        loading={advancing}
                        onClick={() => onAdvance?.(step.stage)}
                      >
                        {step.gatingAction}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {i < journey.length - 1 && (
                <span className="portal-proc__step-connector" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
