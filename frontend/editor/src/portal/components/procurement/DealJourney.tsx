import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import type { Deal, DealStage, JourneyStep } from "@portal/api/procurement";
import { StageStepper } from "@portal/components/procurement/StageStepper";

/**
 * The deal's commercial journey in one card: who's guiding it (the solutions
 * engineer), where it sits (the stage stepper), trial runway while evaluating,
 * and the single next action that advances the deal. Mirrors "one next action
 * at a time"; the full per-stage checklist lives in the Documents card.
 */
export function DealJourney({
  deal,
  journey,
  onAdvance,
  advancing = false,
}: {
  deal: Deal;
  journey: JourneyStep[];
  onAdvance: (stage: DealStage) => void;
  advancing?: boolean;
}) {
  const { t } = useTranslation();
  const { engineer, trial, currentStage } = deal;
  const currentStep = journey.find((s) => s.stage === currentStage);
  const isTerminal =
    journey.length > 0 && journey[journey.length - 1].stage === currentStage;

  return (
    <Card padding="none" className="portal-proc__journey">
      <div className="portal-proc__journey-head">
        <div>
          <span className="portal-proc__eyebrow">
            {t("portal.procurement.journey.eyebrow")}
          </span>
          <h2 className="portal-proc__journey-title">
            {t("portal.procurement.journey.title")}
          </h2>
          <p className="portal-proc__journey-sub">
            {t("portal.procurement.journey.subtitle")}
          </p>
        </div>
        <div className="portal-proc__se">
          <span className="portal-proc__eyebrow">
            {t("portal.procurement.journey.engineerLabel")}
          </span>
          <span className="portal-proc__se-name">{engineer.name}</span>
          <a
            className="portal-proc__se-email"
            href={`mailto:${engineer.email}`}
          >
            {engineer.email}
          </a>
        </div>
      </div>

      <div className="portal-proc__journey-stepper">
        <StageStepper journey={journey} currentStage={currentStage} />
      </div>

      {currentStage === "trial" && (
        <div className="portal-proc__trial">
          <span className="portal-proc__trial-title">
            {t("portal.procurement.journey.trialTitle")}
          </span>
          <span className="portal-proc__trial-dim">
            {t("portal.procurement.journey.daysLeft", {
              count: trial.daysLeft,
            })}
          </span>
          <span className="portal-proc__trial-key">{trial.key}</span>
        </div>
      )}

      <div className="portal-proc__next">
        <div className="portal-proc__next-label">
          <span className="portal-proc__next-dot" data-live={isTerminal} />
          <span>
            {isTerminal
              ? t("portal.procurement.journey.live")
              : t("portal.procurement.journey.nextStep", {
                  action: currentStep ? t(currentStep.gatingAction) : "",
                })}
          </span>
        </div>
        {!isTerminal && currentStep && (
          <Button
            variant="primary"
            accent="premium"
            loading={advancing}
            onClick={() => onAdvance(currentStage)}
          >
            {t(currentStep.gatingAction)}
          </Button>
        )}
      </div>
    </Card>
  );
}
