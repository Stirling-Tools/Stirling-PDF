import React from "react";
import { Button, Card, Badge, Text, Group, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PlanTier } from "@app/hooks/usePlans";

interface PlanCardProps {
  plan?: PlanTier;
  planGroup?: { monthly?: PlanTier; yearly?: PlanTier }; // For proprietary PlanTierGroup compatibility
  isCurrentPlan?: boolean;
  isCurrentTier?: boolean;
  isDowngrade?: boolean;
  isUserProOrAbove?: boolean;
  currentLicenseInfo?: unknown;
  currentTier?: string | null; // Accept null for proprietary compatibility
  onUpgradeClick?: (plan: PlanTier) => void;
  onManageClick?: (plan: PlanTier) => void;
  loginEnabled?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan: propPlan,
  planGroup,
  isCurrentPlan,
  isCurrentTier: _isCurrentTier,
  isDowngrade: _isDowngrade,
  isUserProOrAbove,
  currentLicenseInfo: _currentLicenseInfo,
  currentTier: _currentTier,
  onUpgradeClick,
  onManageClick: _onManageClick,
  loginEnabled: _loginEnabled,
}) => {
  // Use plan from props, or extract from planGroup if proprietary is using it
  const plan = propPlan || planGroup?.monthly || planGroup?.yearly;
  const { t } = useTranslation();

  if (!plan) return null; // Safety check

  const shouldHideUpgrade = plan.id === "free" && isUserProOrAbove;

  return (
    <Card
      key={plan.id}
      padding="lg"
      radius="sm"
      withBorder
      className="h-full w-[33%] relative"
    >
      {plan.popular && (
        <Badge
          variant="filled"
          size="xs"
          style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
        >
          {t("plan.popular", "Popular")}
        </Badge>
      )}

      <Stack gap="md" className="h-full">
        <div>
          <Text size="lg" fw={600}>
            {plan.name}
          </Text>
          <Group gap="xs" align="baseline">
            <Text size="2xl" fw={700}>
              {plan.isContactOnly
                ? t("plan.customPricing", "Custom")
                : `${plan.currency}${plan.price}`}
            </Text>
            {!plan.isContactOnly && (
              <Text size="sm" c="dimmed">
                {plan.period}
              </Text>
            )}
          </Group>
        </div>

        <Stack gap="xs">
          {plan.highlights.map((highlight: string, index: number) => (
            <Text key={index} size="sm" c="dimmed">
              • {highlight}
            </Text>
          ))}
        </Stack>

        <div className="flex-grow" />

        {!shouldHideUpgrade && (
          <Button
            variant={
              isCurrentPlan
                ? "filled"
                : plan.isContactOnly
                  ? "outline"
                  : "filled"
            }
            disabled={isCurrentPlan}
            fullWidth
            onClick={() => onUpgradeClick?.(plan)}
          >
            {isCurrentPlan
              ? t("plan.current", "Current Plan")
              : plan.isContactOnly
                ? t("plan.contact", "Get in Touch")
                : t("plan.upgrade", "Upgrade")}
          </Button>
        )}
      </Stack>
    </Card>
  );
};

export default PlanCard;
