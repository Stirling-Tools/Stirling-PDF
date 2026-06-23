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
  return (
    <div className="portal-proc__locked">
      <EmptyState
        eyebrow="Enterprise only"
        title="The procurement track opens with Enterprise"
        description="Trial keys, committed-volume quotes, the one-signature agreement, payment, and your document ledger all live here once you start an enterprise evaluation."
        actions={
          <Button variant="gradient" accent="purple" onClick={onTalkToSales}>
            Talk to sales
          </Button>
        }
      />
      <Card padding="loose" className="portal-proc__journey-stepper">
        <StageStepper journey={journey} currentStage="trial" locked />
      </Card>
    </div>
  );
}
