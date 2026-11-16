import React, { useId, useRef, useState } from "react";
import { Stack, Text, Group, Divider, Alert, Box } from "@mantine/core";
import "@editor/components/shared/stripeCheckout/team-checkout.css";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import { PlanTier } from "@editor/services/licenseService";
import { formatPrice } from "@editor/components/shared/stripeCheckout/utils/pricingUtils";
import {
  PRESET_BLOCKS,
  SELF_SERVE_MAX_BLOCKS,
  USERS_PER_BLOCK,
  usersForBlocks,
  blocksForUsers,
  shouldOfferEnterprise,
} from "@editor/components/shared/stripeCheckout/utils/capacity";

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

type CustomEntry = "ok" | "empty" | "overLimit";

function checkCustomEntry(value: string, maximum: number): CustomEntry {
  const n = Number(value);
  if (value === "" || !Number.isSafeInteger(n) || n <= 0) return "empty";
  return n > maximum ? "overLimit" : "ok";
}

/**
 * Choose how many users the Team plan should cover.
 *
 * The buyer picks users; the plan is priced per block of {@link USERS_PER_BLOCK}. Presets cover the
 * common sizes and "Custom" turns into a free entry that rounds up to the next whole block, because
 * a part-block cannot be bought. Above the self-serve maximum the hint points to Enterprise.
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
  const [draftUsers, setDraftUsers] = useState(String(covered));

  const adjusting = currentLimit != null;
  const minBlocks = adjusting ? 1 : blocksForUsers(currentUsers);
  const reducing = adjusting && covered < currentLimit;
  const minUsers = usersForBlocks(minBlocks);
  const maxUsers = usersForBlocks(SELF_SERVE_MAX_BLOCKS);
  const belowMinimumCapacity = serverQuantity < minBlocks;
  const offerEnterprise = shouldOfferEnterprise(serverQuantity);

  const presets = PRESET_BLOCKS.filter(
    (blocks) => blocks <= SELF_SERVE_MAX_BLOCKS,
  ).map((blocks) => usersForBlocks(blocks));
  const [showCustom, setShowCustom] = useState(
    () => !presets.includes(covered),
  );
  const customEntry = checkCustomEntry(draftUsers, maxUsers);
  // Focus only when the buyer picks Custom, not whenever the stage remounts in custom mode.
  const focusCustom = useRef(false);
  const hintId = useId();

  const period = isYearly
    ? t("payment.capacityStage.perYear", "/yr")
    : t("payment.capacityStage.perMonth", "/mo");

  const selectUsers = (users: number) =>
    setServerQuantity(blocksForUsers(users));

  return (
    <div className="team-capacity">
      <Stack gap="md" className="team-capacity__choices">
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
          {adjusting
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

        {periodPicker && (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              {t("payment.capacityStage.billingLabel", "Billing")}
            </Text>
            {periodPicker}
          </Stack>
        )}

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {t("payment.capacityStage.usersLabel", "Users")}
          </Text>
          <div
            className="team-capacity__pills"
            style={{
              gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr)) minmax(0, 1.4fr)`,
            }}
          >
            {presets.map((users) => (
              <Button
                key={users}
                variant="secondary"
                px="xs"
                className="team-capacity__pill"
                aria-pressed={!showCustom && covered === users}
                disabled={users < minUsers}
                onClick={() => {
                  setShowCustom(false);
                  setDraftUsers(String(users));
                  selectUsers(users);
                }}
              >
                {users}
              </Button>
            ))}
            {showCustom ? (
              <span className="team-capacity__pill team-capacity__pill--input">
                <input
                  ref={(el) => {
                    if (el && focusCustom.current) {
                      focusCustom.current = false;
                      el.focus();
                    }
                  }}
                  aria-label={t(
                    "payment.capacityStage.customLabel",
                    "Number of users",
                  )}
                  aria-invalid={customEntry !== "ok"}
                  aria-describedby={hintId}
                  inputMode="numeric"
                  value={draftUsers}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, "");
                    setDraftUsers(value);
                    if (checkCustomEntry(value, maxUsers) === "ok")
                      selectUsers(Number(value));
                  }}
                />
              </span>
            ) : (
              <Button
                variant="secondary"
                px="xs"
                className="team-capacity__pill"
                aria-pressed={false}
                onClick={() => {
                  focusCustom.current = true;
                  setDraftUsers(String(covered));
                  setShowCustom(true);
                }}
              >
                {t("payment.capacityStage.custom", "Custom")}
              </Button>
            )}
          </div>
          <Text
            id={hintId}
            aria-live="polite"
            size="xs"
            c="dimmed"
            className="team-capacity__hint"
          >
            {showCustom && (
              <CapacityHint
                entry={customEntry}
                draftUsers={draftUsers}
                covered={covered}
                maxUsers={maxUsers}
                onContactSales={onContactSales}
              />
            )}
          </Text>
        </Stack>

        {belowMinimumCapacity && (
          <Alert color="yellow" variant="light">
            {t(
              "payment.capacityStage.minimumForCurrentUsers",
              "You have {{users}} users, so the plan must cover at least {{minimum}}.",
              { users: currentUsers, minimum: minUsers },
            )}
          </Alert>
        )}

        {reducing && (
          <Text size="sm" c="dimmed">
            {t(
              "payment.capacityStage.reductionNote",
              "The lower capacity starts at your next renewal. Until then, you can use your current allowance. Existing users stay; new users are blocked if you are over capacity when the change takes effect.",
            )}
          </Text>
        )}
      </Stack>

      <CapacitySummary
        blocks={serverQuantity}
        blockPrice={blockPrice}
        currency={currency}
        period={period}
        adjusting={adjusting}
        continueDisabled={
          belowMinimumCapacity || (showCustom && customEntry !== "ok")
        }
        onContinue={onContinue}
        onEnterpriseQuote={offerEnterprise ? onContactSales : undefined}
      />
    </div>
  );
};

interface CapacityHintProps {
  entry: CustomEntry;
  draftUsers: string;
  covered: number;
  maxUsers: number;
  onContactSales?: () => void;
}

/** What a custom entry will buy, or why it cannot be bought here. */
function CapacityHint({
  entry,
  draftUsers,
  covered,
  maxUsers,
  onContactSales,
}: CapacityHintProps) {
  const { t } = useTranslation();

  if (entry === "empty") {
    return t("payment.capacityStage.enterUsers", "Enter a number of users.");
  }
  if (entry === "overLimit") {
    return (
      <>
        {t(
          "payment.capacityStage.selfServeLimit",
          "Up to {{users}} users here.",
          {
            users: maxUsers,
          },
        )}
        {onContactSales && (
          <>
            {" "}
            <button
              type="button"
              className="team-capacity__link"
              onClick={onContactSales}
            >
              {t(
                "payment.capacityStage.talkToEnterprise",
                "For more, talk to us about Enterprise.",
              )}
            </button>
          </>
        )}
      </>
    );
  }
  if (Number(draftUsers) !== covered) {
    return t(
      "payment.capacityStage.roundsUp",
      "Rounds up to {{users}} users.",
      {
        users: covered,
      },
    );
  }
  return null;
}

interface CapacitySummaryProps {
  blocks: number;
  blockPrice: number;
  currency: string;
  period: string;
  /** Changing an existing plan rather than buying a first one. */
  adjusting: boolean;
  continueDisabled: boolean;
  onContinue: () => void;
  onEnterpriseQuote?: () => void;
}

/** The order as it stands, and the way on to payment. */
function CapacitySummary({
  blocks,
  blockPrice,
  currency,
  period,
  adjusting,
  continueDisabled,
  onContinue,
  onEnterpriseQuote,
}: CapacitySummaryProps) {
  const { t } = useTranslation();
  const covered = usersForBlocks(blocks);
  const total = blockPrice * blocks;

  return (
    <Stack gap="md" className="team-capacity__summary">
      <Group gap="xs" wrap="nowrap">
        <Icon name="users" />
        <Text fw={600}>
          {t("payment.capacityStage.planName", "Stirling Team")}
        </Text>
      </Group>
      <div>
        <Text className="team-capacity__covered">{covered}</Text>
        <Text size="sm" c="dimmed">
          {t("payment.capacityStage.usersCovered", "users covered")}
        </Text>
      </div>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
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
            {adjusting
              ? t("payment.capacityStage.newPlanTotal", "New plan total")
              : t("payment.capacityStage.estimatedTotal", "Estimated total")}
          </Text>
          <Text size="xl" fw={700}>
            {formatPrice(total, currency)}
          </Text>
        </Group>
      </Stack>
      <div className="team-capacity__spacer" />
      <Button
        fullWidth
        size="lg"
        onClick={onContinue}
        disabled={continueDisabled}
      >
        {adjusting
          ? t("payment.capacityStage.reviewChange", "Review change in Stripe")
          : t("payment.capacityStage.continue", "Continue to payment")}
      </Button>
      {onEnterpriseQuote && (
        <Button variant="secondary" onClick={onEnterpriseQuote} fullWidth>
          {t(
            "payment.capacityStage.enterpriseQuote",
            "Get an enterprise quote",
          )}
        </Button>
      )}
      <Text size="xs" c="dimmed" ta="center">
        {adjusting
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
            )}{" "}
        {t(
          "payment.capacityStage.currencyAtCheckout",
          "Stripe confirms the final amount and payment currency at checkout.",
        )}
      </Text>
    </Stack>
  );
}
