import React from "react";
import { Card, Text, Group, Flex, Alert, Button, Badge } from "@mantine/core";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { useTranslation } from "react-i18next";
import { PlanTier } from "@app/hooks/usePlans";
import { ManageBillingButton } from "@app/components/shared/ManageBillingButton";

interface TrialStatus {
  isTrialing: boolean;
  trialEnd: string;
  daysRemaining: number;
  hasPaymentMethod: boolean;
  hasScheduledSub: boolean;
}

interface ActivePlanSectionProps {
  currentPlan: PlanTier;
  _activeSince?: string;
  _nextBillingDate?: string;
  trialStatus?: TrialStatus;
  onAddPaymentClick?: () => void;
}

const ActivePlanSection: React.FC<ActivePlanSectionProps> = ({
  currentPlan,
  _activeSince,
  _nextBillingDate,
  trialStatus,
  onAddPaymentClick,
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <Flex justify="space-between" align="center">
        <h3
          style={{
            margin: 0,
            color: "var(--mantine-color-text)",
            fontSize: "1rem",
          }}
        >
          {t("plan.activePlan.title", "Active Plan")}
        </h3>
        <ManageBillingButton
          returnUrl={`${window.location.origin}/account`}
          trialStatus={trialStatus}
        />
      </Flex>
      <p
        style={{
          margin: "0.25rem 0 1rem 0",
          color: "var(--mantine-color-dimmed)",
          fontSize: "0.875rem",
        }}
      >
        {t("plan.activePlan.subtitle", "Your current subscription details")}
      </p>

      {/* Trial Status Alert */}
      {trialStatus?.isTrialing && (
        <Alert
          color="blue"
          icon={<AccessTimeIcon sx={{ fontSize: 16 }} />}
          mt="md"
          mb="md"
          title={t("plan.trial.title", "Free Trial Active")}
        >
          <Text size="sm">
            {t("plan.trial.daysRemaining", "Your trial ends in {{days}} days", {
              days: trialStatus.daysRemaining,
            })}
          </Text>
          <Text size="xs" c="dimmed">
            {t("plan.trial.endDate", "Expires: {{date}}", {
              date: new Date(trialStatus.trialEnd).toLocaleDateString(),
            })}
          </Text>
          {trialStatus.hasScheduledSub ? (
            <Text size="xs" c="green" fw={500} mt="sm">
              ✓{" "}
              {t(
                "plan.trial.subscriptionScheduled",
                "Subscription scheduled - starts {{date}}",
                {
                  date: new Date(trialStatus.trialEnd).toLocaleDateString(),
                },
              )}
            </Text>
          ) : (
            onAddPaymentClick && (
              <Button
                size="xs"
                variant="light"
                mt="sm"
                onClick={onAddPaymentClick}
                leftSection={<CreditCardIcon sx={{ fontSize: 14 }} />}
              >
                {t("plan.trial.subscribeToPro", "Subscribe to Pro")}
              </Button>
            )
          )}
        </Alert>
      )}

      <Card padding="lg" radius="md" withBorder>
        <Group justify="space-between" align="center">
          <div>
            <Group gap="xs">
              <Text size="lg" fw={600}>
                {currentPlan.name}
              </Text>
              {trialStatus?.isTrialing && (
                <Badge color="blue" variant="light">
                  {t("plan.trial.badge", "Trial")}
                </Badge>
              )}
            </Group>
            {/* {activeSince && (
              <Text size="sm" c="dimmed">
                {t('plan.activeSince', 'Active since {{date}}', { date: activeSince })}
              </Text>
            )} */}
          </div>
          <div className="text-right">
            <Text size="xl" fw={700}>
              {currentPlan.currency}
              {currentPlan.price}/month
            </Text>
            {/* {nextBillingDate && (
              <Text size="sm" c="dimmed">
                {t('plan.nextBilling', 'Next billing: {{date}}', { date: nextBillingDate })}
              </Text>
            )} */}
          </div>
        </Group>
      </Card>
    </div>
  );
};

export default ActivePlanSection;
