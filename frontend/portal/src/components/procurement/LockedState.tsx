import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState } from "@shared/components";
import type { JourneyStep } from "@portal/api/procurement";
import { StageStepper } from "@portal/components/procurement/StageStepper";

/**
 * Enterprise-only gate for free/pro buyers. Shows the journey as a greyed
 * preview behind an upgrade prompt so the buyer understands what the
 * commercial track looks like before they talk to sales.
 */
export function LockedState({
  journey,
  onTalkToSales,
}: {
  journey: JourneyStep[];
  onTalkToSales: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-proc__locked">
      <EmptyState
        eyebrow={t("procurement.locked.eyebrow")}
        title={t("procurement.locked.title")}
        description={t("procurement.locked.description")}
        actions={
          <Button variant="gradient" accent="purple" onClick={onTalkToSales}>
            {t("procurement.locked.talkToSales")}
          </Button>
        }
      />
      <Card padding="loose" className="portal-proc__journey-stepper">
        <StageStepper journey={journey} currentStage="trial" locked />
      </Card>
    </div>
  );
}
