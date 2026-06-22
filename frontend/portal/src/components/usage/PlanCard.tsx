import { useTranslation } from "react-i18next";
import { Button, Card, StatusBadge } from "@shared/components";
import type { PlanOption } from "@portal/api/usage";
import "@portal/views/Usage.css";

/** A single plan in the catalogue grid; highlighted when it's the active plan. */
export function PlanCard({
  plan,
  isCurrent,
  onSelect,
}: {
  plan: PlanOption;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const accent = plan.tier === "enterprise" ? "purple" : "blue";
  return (
    <Card
      accent={plan.tier === "free" ? undefined : accent}
      padding="loose"
      className={
        "portal-usage__plan-card" +
        (isCurrent ? " portal-usage__plan-card--current" : "")
      }
    >
      <div className="portal-usage__plan-card-head">
        <h3 className="portal-usage__plan-card-name">{plan.name}</h3>
        {isCurrent && (
          <StatusBadge tone="success" size="sm">
            {t("usage.planCard.current")}
          </StatusBadge>
        )}
      </div>
      <div className="portal-usage__plan-card-price">
        <span className="portal-usage__plan-card-amount">{plan.price}</span>
        <span className="portal-usage__plan-card-cadence">
          {plan.priceCadence}
        </span>
      </div>
      <p className="portal-usage__plan-card-blurb">{plan.blurb}</p>
      <ul className="portal-usage__plan-card-features">
        {plan.features.map((f) => (
          <li key={f}>
            <span aria-hidden className="portal-usage__plan-card-check">
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>
      <Button
        variant={isCurrent ? "outline" : "gradient"}
        accent={accent}
        size="sm"
        fullWidth
        disabled={isCurrent}
        onClick={onSelect}
      >
        {isCurrent
          ? t("usage.planCard.yourPlan")
          : plan.tier === "enterprise"
            ? t("usage.planCard.contactSales")
            : t("usage.planCard.choosePlan")}
      </Button>
    </Card>
  );
}
