import React, { useState } from "react";
import { Button, Card, Badge, Text, Collapse } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PlanTier } from "@app/hooks/usePlans";
import PlanCard from "@app/components/shared/config/configSections/plan/PlanCard";

interface AvailablePlansSectionProps {
  plans: PlanTier[];
  currentPlan?: PlanTier;
  currentLicenseInfo?: unknown;
  onUpgradeClick: (plan: PlanTier) => void;
  onManageClick?: (plan: PlanTier) => void;
  currency?: string;
  onCurrencyChange?: (currency: string) => void;
  currencyOptions?: Array<{ value: string; label: string }>;
  loginEnabled?: boolean;
}

const AvailablePlansSection: React.FC<AvailablePlansSectionProps> = ({
  plans,
  currentPlan,
  onUpgradeClick,
}) => {
  const { t } = useTranslation();
  const [showComparison, setShowComparison] = useState(false);

  const isUserProOrAbove =
    currentPlan?.id === "pro" || currentPlan?.id === "enterprise";

  return (
    <div>
      <h3
        style={{
          margin: 0,
          color: "var(--mantine-color-text)",
          fontSize: "1rem",
        }}
      >
        {t("plan.availablePlans.title", "Available Plans")}
      </h3>
      <p
        style={{
          margin: "0.25rem 0 1rem 0",
          color: "var(--mantine-color-dimmed)",
          fontSize: "0.875rem",
        }}
      >
        {t(
          "plan.availablePlans.subtitle",
          "Choose the plan that fits your needs",
        )}
      </p>

      <div
        className="flex h-[20rem] mb-4 "
        style={{ gap: "1rem", overflowX: "auto" }}
      >
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrentPlan={plan.id === currentPlan?.id}
            isUserProOrAbove={isUserProOrAbove}
            onUpgradeClick={onUpgradeClick}
          />
        ))}
      </div>

      <div className="text-center">
        <Button
          variant="subtle"
          onClick={() => setShowComparison(!showComparison)}
        >
          {showComparison
            ? t("plan.hideComparison", "Hide Feature Comparison")
            : t("plan.showComparison", "Compare All Features")}
        </Button>
      </div>

      <Collapse in={showComparison}>
        <Card padding="lg" radius="md" withBorder className="mt-4">
          <Text size="lg" fw={600} mb="md">
            {t("plan.featureComparison", "Feature Comparison")}
          </Text>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">
                    {t("plan.feature.title", "Feature")}
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.id}
                      className="text-center p-2 min-w-24 relative"
                    >
                      {plan.name}
                      {plan.popular && (
                        <Badge
                          color="blue"
                          variant="filled"
                          style={{
                            position: "absolute",
                            top: "0rem",
                            right: "-2rem",
                            fontSize: "0.5rem",
                            fontWeight: "500",
                            height: "1rem",
                            padding: "0 0.1rem",
                          }}
                        >
                          {t("plan.popular", "Popular")}
                        </Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans[0].features.map((_, featureIndex) => (
                  <tr key={featureIndex} className="border-b">
                    <td className="p-2">
                      {plans[0].features[featureIndex].name}
                    </td>
                    {plans.map((plan) => (
                      <td key={plan.id} className="text-center p-2">
                        {plan.features[featureIndex].included ? (
                          <Text c="green" fw={600}>
                            ✓
                          </Text>
                        ) : (
                          <Text c="gray">-</Text>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Collapse>
    </div>
  );
};

export default AvailablePlansSection;
