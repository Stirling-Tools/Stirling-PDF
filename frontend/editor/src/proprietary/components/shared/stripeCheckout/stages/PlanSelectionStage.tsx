import React from "react";
import { Stack, Text, Grid, Paper, Alert, Divider } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { PlanTierGroup } from "@app/services/licenseService";
import { SavingsCalculation } from "@app/components/shared/stripeCheckout/types/checkout";
import { PricingBadge } from "@app/components/shared/stripeCheckout/components/PricingBadge";
import { PriceDisplay } from "@app/components/shared/stripeCheckout/components/PriceDisplay";
import {
  formatPrice,
  calculateMonthlyEquivalent,
  calculateTotalWithSeats,
} from "@app/components/shared/stripeCheckout/utils/pricingUtils";
import { getClickablePaperStyle } from "@app/components/shared/stripeCheckout/utils/cardStyles";

interface PlanSelectionStageProps {
  planGroup: PlanTierGroup;
  minimumSeats: number;
  savings: SavingsCalculation | null;
  onSelectPlan: (period: "monthly" | "yearly") => void;
  /**
   * The period currently chosen. Supplied when these cards share a page with another control, so
   * picking one is a selection the buyer can see rather than a step that navigates away. Absent,
   * neither card claims to be chosen: both buttons stay secondary.
   */
  selectedPeriod?: "monthly" | "yearly";
  compact?: boolean;
}

export const PlanSelectionStage: React.FC<PlanSelectionStageProps> = ({
  planGroup,
  minimumSeats,
  savings,
  onSelectPlan,
  selectedPeriod,
  compact = false,
}) => {
  const { t } = useTranslation();
  const isEnterprise = planGroup.tier === "enterprise";
  const seatCount = minimumSeats || 1;

  if (compact) {
    return (
      <div
        role="group"
        aria-label={t("payment.billingPeriod", "Billing period")}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        {(["monthly", "yearly"] as const).map((period) => {
          const plan = planGroup[period];
          if (!plan) return null;
          const selected = selectedPeriod === period;
          return (
            <button
              key={period}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectPlan(period)}
              style={{
                textAlign: "left",
                padding: "0.75rem",
                borderRadius: "0.75rem",
                cursor: "pointer",
                color: "var(--c-text)",
                border: `1px solid ${selected ? "var(--c-primary)" : "var(--c-border)"}`,
                background: selected
                  ? "var(--c-primary-subtle)"
                  : "transparent",
              }}
            >
              <Text component="span" display="block" fw={600}>
                {period === "monthly"
                  ? t("payment.monthly", "Monthly")
                  : t("payment.yearly", "Yearly")}
              </Text>
              <Text component="span" display="block" size="sm" c="dimmed">
                {formatPrice(plan.price, plan.currency, 0)}
                {period === "monthly"
                  ? t("payment.capacityStage.perMonth", "/mo")
                  : t("payment.capacityStage.perYear", "/yr")}
                {" · "}
                {period === "yearly" && savings
                  ? t("payment.planStage.savePercent", "Save {{percent}}%", {
                      percent: savings.percent,
                    })
                  : t("payment.perUserBlock", "per 100 users")}
              </Text>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <Stack gap="lg" style={{ padding: "1rem 2rem" }}>
      <Grid gutter="xl" style={{ marginTop: "1rem" }}>
        {/* Monthly Option */}
        {planGroup.monthly && (
          <Grid.Col span={6}>
            <Paper
              withBorder
              p="xl"
              radius="md"
              style={getClickablePaperStyle(selectedPeriod === "monthly")}
              onClick={() => onSelectPlan("monthly")}
            >
              <Stack
                gap="md"
                style={{ height: "100%" }}
                justify="space-between"
              >
                <Text size="lg" fw={600}>
                  {t("payment.monthly", "Monthly")}
                </Text>

                <Divider />

                {isEnterprise && planGroup.monthly.seatPrice ? (
                  <PriceDisplay
                    mode="enterprise"
                    basePrice={planGroup.monthly.price}
                    seatPrice={planGroup.monthly.seatPrice}
                    totalPrice={calculateTotalWithSeats(
                      planGroup.monthly.price,
                      planGroup.monthly.seatPrice,
                      seatCount,
                    )}
                    currency={planGroup.monthly.currency}
                    period="month"
                    seatCount={seatCount}
                    size="sm"
                  />
                ) : (
                  <PriceDisplay
                    mode="simple"
                    price={planGroup.monthly?.price || 0}
                    currency={planGroup.monthly?.currency || "£"}
                    period={t("payment.perMonth", "/month")}
                    size="2.5rem"
                  />
                )}

                <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
                  <Button
                    variant={
                      selectedPeriod === "monthly" ? "primary" : "secondary"
                    }
                    fullWidth
                  >
                    {selectedPeriod === "monthly"
                      ? t("payment.planStage.selectedMonthly", "Monthly")
                      : t("payment.planStage.selectMonthly", "Select Monthly")}
                  </Button>
                </div>
              </Stack>
            </Paper>
          </Grid.Col>
        )}

        {/* Yearly Option */}
        {planGroup.yearly && (
          <Grid.Col span={6}>
            <Paper
              withBorder
              p="xl"
              radius="md"
              style={getClickablePaperStyle(
                selectedPeriod ? selectedPeriod === "yearly" : !!savings,
              )}
              onClick={() => onSelectPlan("yearly")}
            >
              {savings && (
                <PricingBadge
                  type="savings"
                  label={t(
                    "payment.planStage.savePercent",
                    "Save {{percent}}%",
                    { percent: savings.percent },
                  )}
                />
              )}

              <Stack
                gap="md"
                style={{ height: "100%" }}
                justify="space-between"
              >
                <Text size="lg" fw={600}>
                  {t("payment.yearly", "Yearly")}
                </Text>

                <Divider />

                {isEnterprise && planGroup.yearly.seatPrice ? (
                  <Stack gap="sm">
                    <PriceDisplay
                      mode="enterprise"
                      basePrice={planGroup.yearly.price}
                      seatPrice={planGroup.yearly.seatPrice}
                      totalPrice={calculateMonthlyEquivalent(
                        calculateTotalWithSeats(
                          planGroup.yearly.price,
                          planGroup.yearly.seatPrice,
                          seatCount,
                        ),
                      )}
                      currency={planGroup.yearly.currency}
                      period="year"
                      seatCount={seatCount}
                      size="sm"
                    />
                    <Text size="sm" c="dimmed">
                      {t(
                        "payment.planStage.billedYearly",
                        "Billed yearly at {{currency}}{{amount}}",
                        {
                          currency: planGroup.yearly.currency,
                          amount: calculateTotalWithSeats(
                            planGroup.yearly.price,
                            planGroup.yearly.seatPrice,
                            seatCount,
                          ).toFixed(2),
                        },
                      )}
                    </Text>
                  </Stack>
                ) : (
                  <Stack gap={0}>
                    <PriceDisplay
                      mode="simple"
                      price={calculateMonthlyEquivalent(
                        planGroup.yearly?.price || 0,
                      )}
                      currency={planGroup.yearly?.currency || "£"}
                      period={t("payment.perMonth", "/month")}
                      size="2.5rem"
                    />
                    <Text size="sm" c="dimmed" mt="xs">
                      {t(
                        "payment.planStage.billedYearly",
                        "Billed yearly at {{currency}}{{amount}}",
                        {
                          currency: planGroup.yearly?.currency,
                          amount: planGroup.yearly?.price.toFixed(2),
                        },
                      )}
                    </Text>
                  </Stack>
                )}

                {savings && (
                  <Alert color="green" variant="light" p="sm">
                    <Text size="sm" fw={600}>
                      {t(
                        "payment.planStage.savingsAmount",
                        "You save {{amount}}",
                        {
                          amount: formatPrice(savings.amount, savings.currency),
                        },
                      )}
                    </Text>
                  </Alert>
                )}

                <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
                  <Button
                    variant={
                      selectedPeriod === "yearly" ? "primary" : "secondary"
                    }
                    fullWidth
                  >
                    {selectedPeriod === "yearly"
                      ? t("payment.planStage.selectedYearly", "Yearly")
                      : t("payment.planStage.selectYearly", "Select Yearly")}
                  </Button>
                </div>
              </Stack>
            </Paper>
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
};
