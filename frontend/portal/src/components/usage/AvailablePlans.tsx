import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <section className="portal-usage__plans-block">
      <header className="portal-usage__section-head">
        <h2 className="portal-usage__section-title">
          {t("usage.plans.title")}
        </h2>
        <p className="portal-usage__section-sub">{t("usage.plans.subtitle")}</p>
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
