import React from "react";
import { Stack, Text, Group, Divider, Alert, NumberInput } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { PlanTier } from "@app/services/licenseService";
import { formatPrice } from "@app/components/shared/stripeCheckout/utils/pricingUtils";
import {
  USERS_PER_SERVER,
  SELF_SERVE_MAX_SERVERS,
  usersForServers,
  serversForUsers,
  shouldOfferEnterprise,
} from "@app/components/shared/stripeCheckout/utils/capacity";

interface CapacityStageProps {
  /** The plan the buyer picked a billing period for; supplies unit price and currency. */
  selectedPlan: PlanTier | null;
  serverQuantity: number;
  setServerQuantity: (quantity: number) => void;
  /** Users already on this installation, so capacity cannot be set below what is in use. */
  currentUsers?: number;
  onContinue: () => void;
  onContactSales?: () => void;
}

/**
 * Pick how much capacity to buy.
 *
 * The stepper counts servers because that is the unit we sell; every figure beside it is stated in
 * users because that is the unit an admin measures. The line item does the translation.
 */
export const CapacityStage: React.FC<CapacityStageProps> = ({
  selectedPlan,
  serverQuantity,
  setServerQuantity,
  currentUsers = 0,
  onContinue,
  onContactSales,
}) => {
  const { t } = useTranslation();

  const currency = selectedPlan?.currency || "$";
  const unitPrice = selectedPlan?.price || 0;
  const isYearly = selectedPlan?.period?.includes("year") ?? false;
  const covered = usersForServers(serverQuantity);
  const total = unitPrice * serverQuantity;

  // Never sell less capacity than is already in use; reducing capacity happens at renewal rather
  // than by stranding accounts that already exist. The stage is entered pre-seeded to this minimum,
  // so the guard below only fires if a caller passes something lower.
  const minServers = serversForUsers(currentUsers);
  const belowCurrentUsage = serverQuantity < minServers;
  const offerEnterprise = shouldOfferEnterprise(serverQuantity);

  const setClamped = (value: number) =>
    setServerQuantity(
      Math.max(minServers, Math.min(SELF_SERVE_MAX_SERVERS, value)),
    );

  return (
    <Stack gap="lg" style={{ padding: "1.5rem 2rem" }}>
      <div>
        <Text size="xl" fw={600}>
          {t("payment.capacityStage.heading", "How many users do you need?")}
        </Text>
        <Text size="sm" c="dimmed" mt={4}>
          {t(
            "payment.capacityStage.subheading",
            "Each server covers {{users}} users. Add servers to cover more.",
            { users: USERS_PER_SERVER },
          )}
        </Text>
      </div>

      <Group align="flex-end" gap="xl" wrap="wrap">
        <NumberInput
          label={t("payment.capacityStage.serversLabel", "Servers")}
          value={serverQuantity}
          onChange={(value) => setClamped(Number(value) || minServers)}
          min={minServers}
          max={SELF_SERVE_MAX_SERVERS}
          clampBehavior="strict"
          allowDecimal={false}
          allowNegative={false}
          size="lg"
          style={{ width: 140 }}
        />
        <Stack gap={0} pb={6}>
          <Text size="xs" c="dimmed">
            {t("payment.capacityStage.coversUpTo", "Covers up to")}
          </Text>
          <Text size="lg" fw={600}>
            {t("payment.capacityStage.userTotal", "{{users}} users", {
              users: covered,
            })}
          </Text>
        </Stack>
      </Group>

      {belowCurrentUsage && (
        <Alert color="yellow" variant="light">
          {t(
            "payment.capacityStage.minimumForCurrentUsers",
            "You have {{users}} users, so you need at least {{servers}} servers.",
            { users: currentUsers, servers: minServers },
          )}
        </Alert>
      )}

      <Divider />

      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t("payment.capacityStage.lineItem", "Servers x {{servers}}", {
              servers: serverQuantity,
            })}
          </Text>
          <Text size="sm">
            {t("payment.capacityStage.addedUsers", "+{{users}} users", {
              users: covered,
            })}
          </Text>
        </Group>
        <Group justify="space-between" align="baseline">
          <Text fw={600}>
            {isYearly
              ? t("payment.capacityStage.totalYearly", "Total, billed yearly")
              : t(
                  "payment.capacityStage.totalMonthly",
                  "Total, billed monthly",
                )}
          </Text>
          <Text size="xl" fw={700}>
            {formatPrice(total, currency)}
          </Text>
        </Group>
      </Stack>

      <Stack gap="sm">
        <Button onClick={onContinue} disabled={belowCurrentUsage} fullWidth>
          {t("payment.capacityStage.continue", "Continue to payment")}
        </Button>

        {offerEnterprise && onContactSales && (
          <Button variant="secondary" onClick={onContactSales} fullWidth>
            {t(
              "payment.capacityStage.enterpriseQuote",
              "Get an enterprise quote",
            )}
          </Button>
        )}
      </Stack>
    </Stack>
  );
};
