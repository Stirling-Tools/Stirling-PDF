import type { Tier } from "@portal/contexts/TierContext";
import type { PlanOption } from "@portal/api/usage";
import { PlanCard } from "@portal/components/usage/PlanCard";
import "@portal/views/Usage.css";

/** The plan-catalogue grid, marking the caller's current tier. */
export function AvailablePlans({
  plans,
  current,
  onSelect,
}: {
  plans: PlanOption[];
  current: Tier;
  onSelect: (plan: PlanOption) => void;
}) {
  return (
    <section className="portal-usage__plans-block">
      <header className="portal-usage__section-head">
        <h2 className="portal-usage__section-title">Plans</h2>
        <p className="portal-usage__section-sub">
          Move up or down at any time — changes take effect next cycle.
        </p>
      </header>
      <div className="portal-usage__plans-grid">
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isCurrent={plan.tier === current}
            onSelect={() => onSelect(plan)}
          />
        ))}
      </div>
    </section>
  );
}
