import React, { useState } from "react";
import {
  Stack,
  Text,
  Group,
  Divider,
  Alert,
  NumberInput,
  Box,
} from "@mantine/core";
import "@app/components/shared/stripeCheckout/team-checkout.css";
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
  /** Stripe quantity counts blocks of users. */
  serverQuantity: number;
  setServerQuantity: (quantity: number) => void;
  /** Users already on this installation, so capacity cannot be set below what is in use. */
  currentUsers?: number;
  /** Existing purchased capacity; an adjustment selects the new total. */
  currentLimit?: number | null;
  periodPicker?: React.ReactNode;
  capacityNotice?: { users: number; limit: number };
  onContinue: () => void;
  onContactSales?: () => void;
}

function showCustomValueInvalid(
  value: number | string,
  minimum: number,
  maximum: number,
) {
  return (
    value === "" ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum ||
    Number(value) > maximum
  );
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
  currentLimit = null,
  periodPicker,
  capacityNotice,
  onContinue,
  onContactSales,
}) => {
  const { t } = useTranslation();

  const currency = selectedPlan?.currency || "$";
  const blockPrice = selectedPlan?.price || 0;
  const isYearly = selectedPlan?.period?.includes("year") ?? false;
  const covered = usersForBlocks(serverQuantity);
  const total = blockPrice * serverQuantity;
  const [draftUsers, setDraftUsers] = useState<number | string>(covered);

  // Adding capacity cannot reduce the purchased allowance or strand existing users.
  const minBlocks = blocksForUsers(Math.max(currentUsers, currentLimit ?? 0));
  const minUsers = usersForBlocks(minBlocks);
  const maxUsers = usersForBlocks(SELF_SERVE_MAX_BLOCKS);
  const belowMinimumCapacity = serverQuantity < minBlocks;
  const offerEnterprise = shouldOfferEnterprise(serverQuantity);
  const invalidDraft = showCustomValueInvalid(draftUsers, 1, maxUsers);

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
    <Stack gap="sm" className="team-capacity">
      {capacityNotice && capacityNotice.users > capacityNotice.limit && (
        <Box className="team-capacity__notice">
          <Text size="sm" fw={500}>
            {t(
              "payment.capacityStage.overCapacityTitle",
              "Your server has more users than your plan covers",
            )}
          </Text>
          <Text size="sm" mt={4}>
            {t(
              "payment.capacityStage.overCapacityBody",
              "{{users}} users are on this server; your current allowance is {{limit}}. Choose a Team plan below to cover everyone.",
              { users: capacityNotice.users, limit: capacityNotice.limit },
            )}
          </Text>
          <Text size="xs" c="dimmed" mt={6}>
            {t(
              "payment.capacityStage.overCapacityConsequence",
              "Existing accounts stay in place. Adding or inviting users is blocked until you add capacity or free up seats.",
            )}
          </Text>
        </Box>
      )}
      <Text size="sm" c="dimmed">
        {currentLimit != null
          ? t(
              "payment.capacityStage.subheadingAdd",
              "Your plan covers {{current}} users today. Choose the new total.",
              {
                current: currentLimit,
              },
            )
          : t(
              "payment.capacityStage.subheading",
              "Covers everyone you invite, in blocks of {{users}} users.",
              {
                users: USERS_PER_BLOCK,
              },
            )}
      </Text>

      <Box className="team-capacity__selection">
        <Group gap="xs" wrap="wrap" align="center">
          <Text size="sm" fw={500}>
            {t("payment.capacityStage.usersLabel", "Users")}
          </Text>
          {presets.map((users) => (
            <Button
              key={users}
              variant="secondary"
              className="team-capacity__pill"
              aria-pressed={!showCustom && covered === users}
              disabled={users < minUsers}
              onClick={() => {
                setShowCustom(false);
                setDraftUsers(users);
                selectUsers(users);
              }}
            >
              {users}
            </Button>
          ))}
          <Button
            variant="secondary"
            className="team-capacity__pill"
            aria-pressed={showCustom}
            onClick={() => {
              setDraftUsers(covered);
              setShowCustom(true);
            }}
          >
            {t("payment.capacityStage.other", "Other")}
          </Button>
        </Group>

        {showCustom && (
          <Group gap="xs" mt="xs">
            <NumberInput
              aria-label={t(
                "payment.capacityStage.customLabel",
                "Number of users",
              )}
              value={draftUsers}
              onChange={(value) => {
                setDraftUsers(value);
                if (
                  value !== "" &&
                  Number.isSafeInteger(Number(value)) &&
                  Number(value) > 0
                )
                  selectUsers(Number(value));
              }}
              min={minUsers}
              max={maxUsers}
              clampBehavior="none"
              hideControls
              allowDecimal={false}
              allowNegative={false}
              style={{ width: 80 }}
            />
            <Text size="xs" c="dimmed">
              {t("payment.capacityStage.roundsTo", "rounds to {{users}}", {
                users: covered,
              })}
            </Text>
          </Group>
        )}
      </Box>

      {belowMinimumCapacity && (
        <Alert color="yellow" variant="light">
          {t(
            "payment.capacityStage.minimumForCurrentUsers",
            "You have {{users}} users, so the plan must cover at least {{minimum}}.",
            { users: currentUsers, minimum: minUsers },
          )}
        </Alert>
      )}

      {periodPicker}

      <Stack gap="sm" className="team-capacity__receipt">
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
        <Divider />
        <Group justify="space-between" align="baseline">
          <Text fw={600}>
            {currentLimit != null
              ? t("payment.capacityStage.newPlanTotal", "New plan total")
              : t("payment.capacityStage.dueToday", "Due today")}
          </Text>
          <Text size="md" fw={600}>
            {formatPrice(total, currency)}
          </Text>
        </Group>
      </Stack>
      <Text size="xs" c="dimmed">
        {currentLimit != null
          ? t(
              "payment.capacityStage.adjustmentNote",
              "Stripe will show the exact charge, any prorations and your next billing date before you confirm. Your saved payment method will be used if available.",
            )
          : t(
              "payment.capacityStage.renewalNote",
              "Renews at {{total}}{{period}}. Cancel any time in Usage & Billing.",
              {
                total: formatPrice(total, currency, 0),
                period,
              },
            )}
      </Text>

      <Group justify="flex-end" mt="sm">
        <Button
          onClick={onContinue}
          disabled={belowMinimumCapacity || (showCustom && invalidDraft)}
        >
          {currentLimit != null
            ? t("payment.capacityStage.reviewChange", "Review change in Stripe")
            : t("payment.capacityStage.continue", "Continue to payment")}
        </Button>

        {offerEnterprise && onContactSales && (
          <Button variant="secondary" onClick={onContactSales} fullWidth>
            {t(
              "payment.capacityStage.enterpriseQuote",
              "Get an enterprise quote",
            )}
          </Button>
        )}
      </Group>
    </Stack>
  );
};
