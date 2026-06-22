import { MetricCard, MetricStrip } from "@shared/components";
import type { Deal, JourneyStep, LedgerGroup } from "@portal/api/procurement";
import { USD } from "@portal/components/procurement/format";

/** Documents still waiting on the buyer (action) or not yet generated (request). */
function countOutstanding(ledger: LedgerGroup[]): number {
  return ledger.reduce(
    (sum, g) =>
      sum +
      g.docs.filter((d) => d.status === "action" || d.status === "request")
        .length,
    0,
  );
}

/** Headline deal KPIs: current stage, trial runway, quote value, docs outstanding. */
export function ProcurementKpiStrip({
  deal,
  journey,
  ledger,
}: {
  deal: Deal;
  journey: JourneyStep[];
  ledger: LedgerGroup[];
}) {
  const stageLabel =
    journey.find((s) => s.stage === deal.currentStage)?.label ?? "—";
  const outstanding = countOutstanding(ledger);

  return (
    <MetricStrip>
      <MetricCard
        label="Current stage"
        value={stageLabel}
        description="Where your deal sits today"
      />
      <MetricCard
        label="Days left in trial"
        value={deal.trial.daysLeft}
        description={`${deal.trial.maxExtensions - deal.trial.extensionsUsed} extension(s) available`}
      />
      <MetricCard
        label="Quote value"
        value={USD.format(deal.quote.amount)}
        description={`${deal.quote.term} · ${deal.quote.number}`}
      />
      <MetricCard
        label="Documents outstanding"
        value={outstanding}
        description={outstanding === 0 ? "All clear" : "Awaiting your action"}
      />
    </MetricStrip>
  );
}
