import React, { useState } from "react";
import { Stack, Text, Group, Divider, Alert, NumberInput } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { PlanTier } from "@app/services/licenseService";
import { formatPrice } from "@app/components/shared/stripeCheckout/utils/pricingUtils";
import {
  USERS_PER_BLOCK,
  SELF_SERVE_MAX_BLOCKS,
  USER_PRESETS,
  usersForBlocks,
  blocksForUsers,
  shouldOfferEnterprise,
} from "@app/components/shared/stripeCheckout/utils/capacity";

interface CapacityStageProps {
  /** The plan the buyer picked a billing period for; supplies block price and currency. */
  selectedPlan: PlanTier | null;
  /**
   * Blocks of users being bought. Held in blocks because that is what the Stripe line item counts,
   * but nothing shown to the buyer says so.
   */
  serverQuantity: number;
  setServerQuantity: (quantity: number) => void;
  /** Users already on this installation, so capacity cannot be set below what is in use. */
  currentUsers?: number;
  onContinue: () => void;
  onContactSales?: () => void;
}

/**
 * Choose how many users the Team plan should cover.
 *
 * The buyer picks users; the plan is priced per block of {@link USERS_PER_BLOCK}. Presets cover the
 * common sizes and "Other" opens a free entry that rounds up to the next whole block, because a
 * part-block cannot be bought.
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
  const blockPrice = selectedPlan?.price || 0;
  const isYearly = selectedPlan?.period?.includes("year") ?? false;
  const covered = usersForBlocks(serverQuantity);
  const total = blockPrice * serverQuantity;

  // Never sell less capacity than is already in use; reducing capacity happens at renewal rather
  // than by stranding accounts that already exist. The stage is entered pre-seeded to this minimum.
  const minBlocks = blocksForUsers(currentUsers);
  const minUsers = usersForBlocks(minBlocks);
  const maxUsers = usersForBlocks(SELF_SERVE_MAX_BLOCKS);
  const belowCurrentUsage = serverQuantity < minBlocks;
  const offerEnterprise = shouldOfferEnterprise(serverQuantity);

  const presets = USER_PRESETS.filter((users) => users <= maxUsers);
  const [showCustom, setShowCustom] = useState(
    () => !presets.includes(usersForBlocks(serverQuantity)),
  );

  const period = isYearly
    ? t("payment.capacityStage.perYear", "/yr")
    : t("payment.capacityStage.perMonth", "/mo");

  const selectUsers = (users: number) =>
    setServerQuantity(blocksForUsers(users));

  return (
    <Stack gap="lg" style={{ padding: "1.5rem 2rem" }}>
      <Text size="sm" c="dimmed">
        {t(
          "payment.capacityStage.subheading",
          "Covers everyone you invite, in blocks of {{users}} users.",
          { users: USERS_PER_BLOCK },
        )}
      </Text>

      <Group gap="sm" wrap="wrap" align="center">
        <Text size="sm" fw={500}>
          {t("payment.capacityStage.usersLabel", "Users")}
        </Text>
        {presets.map((users) => (
          <Button
            key={users}
            variant={!showCustom && covered === users ? "primary" : "secondary"}
            disabled={users < minUsers}
            onClick={() => {
              setShowCustom(false);
              selectUsers(users);
            }}
          >
            {users}
          </Button>
        ))}
        <Button
          variant={showCustom ? "primary" : "secondary"}
          onClick={() => setShowCustom(true)}
        >
          {t("payment.capacityStage.other", "Other")}
        </Button>
      </Group>

      {showCustom && (
        <NumberInput
          label={t("payment.capacityStage.customLabel", "Number of users")}
          description={t(
            "payment.capacityStage.customHint",
            "Rounded up to the next block of {{users}}.",
            { users: USERS_PER_BLOCK },
          )}
          value={covered}
          onChange={(value) => selectUsers(Number(value) || minUsers)}
          min={minUsers}
          max={maxUsers}
          step={USERS_PER_BLOCK}
          clampBehavior="strict"
          allowDecimal={false}
          allowNegative={false}
          style={{ width: 220 }}
        />
      )}

      {belowCurrentUsage && (
        <Alert color="yellow" variant="light">
          {t(
            "payment.capacityStage.minimumForCurrentUsers",
            "You have {{users}} users, so the plan must cover at least {{minimum}}.",
            { users: currentUsers, minimum: minUsers },
          )}
        </Alert>
      )}

      <Divider />

      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t(
              "payment.capacityStage.lineItem",
              "Team · {{price}}{{period}} per {{block}} users",
              {
                price: formatPrice(blockPrice, currency, 0),
                period,
                block: USERS_PER_BLOCK,
              },
            )}
          </Text>
          <Text size="sm" fw={500}>
            {t("payment.capacityStage.userTotal", "{{users}} users", {
              users: covered,
            })}
          </Text>
        </Group>
        <Group justify="space-between" align="baseline">
          <Text fw={600}>
            {t("payment.capacityStage.dueToday", "Due today")}
          </Text>
          <Text size="xl" fw={700}>
            {formatPrice(total, currency)}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {t(
            "payment.capacityStage.renewalNote",
            "Renews at {{total}}{{period}}. Cancel any time in Usage & Billing.",
            { total: formatPrice(total, currency, 0), period },
          )}
        </Text>
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
