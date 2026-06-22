import { Button, EmptyState } from "@shared/components";
import type { JourneyStep } from "@portal/api/procurement";
import { DealStepper } from "@portal/components/procurement/DealStepper";

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
      <DealStepper journey={journey} currentStage="trial" locked />
    </div>
  );
}
