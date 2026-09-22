import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import type { LegacyBillingState } from "@app/types/legacyBilling";

/** Displays owner billing without claiming that a legacy plan grants current product allowances. */
export function LegacySubscriptionPlan({
  billing,
  walletTeamId,
}: {
  billing: LegacyBillingState;
  /** The main billing screen renders this team's allowance in its Users row. */
  walletTeamId?: number;
}) {
  const { t } = useTranslation();
  if (billing.loading)
    return (
      <Text role="status">
        {t("legacyBilling.loading", "Checking your subscription…")}
      </Text>
    );
  if (billing.loadError) {
    return (
      <Banner
        tone="warning"
        action={
          <Button onClick={billing.refresh}>
            {t("legacyBilling.retry", "Try again")}
          </Button>
        }
      >
        {t(
          "legacyBilling.loadError",
          "We couldn't check your existing subscription. Try again before purchasing another plan.",
        )}
      </Banner>
    );
  }
  if (!billing.subscriptions.length) return null;
  const statusLabels = {
    active: t("legacyBilling.status.active", "Active"),
    trialing: t("legacyBilling.status.trialing", "Trial"),
    past_due: t("legacyBilling.status.past_due", "Payment overdue"),
    unpaid: t("legacyBilling.status.unpaid", "Unpaid"),
    paused: t("legacyBilling.status.paused", "Paused"),
    incomplete: t("legacyBilling.status.incomplete", "Payment pending"),
  };
  return (
    <Stack gap="sm">
      {billing.subscriptions.map((subscription) => (
        <div key={subscription.id}>
          <div className="billing-id">
            <span className="billing-id__name">
              {subscription.plan === "pro"
                ? t("legacyBilling.pro", "Pro (legacy)")
                : t("legacyBilling.team", "Team (legacy)")}
            </span>
            <span className="billing-id__sub">
              {statusLabels[subscription.status]}
            </span>
          </div>
          {subscription.plan === "team" &&
            (!subscription.teamAllowance ||
              subscription.teamId !== walletTeamId) && (
              <Text size="sm">
                {subscription.teamAllowance
                  ? subscription.teamAllowance.maxUsers == null
                    ? t(
                        "legacyBilling.unlimitedUsers",
                        "Your team: unlimited users ({{used}} in use)",
                        { used: subscription.teamAllowance.usersInUse },
                      )
                    : t(
                        "legacyBilling.teamUsers",
                        "Your team: {{used}} of {{limit}} users",
                        {
                          used: subscription.teamAllowance.usersInUse,
                          limit: subscription.teamAllowance.maxUsers,
                        },
                      )
                  : t(
                      "legacyBilling.usersUnavailable",
                      "We couldn't confirm your team's user allowance. Contact support to check your legacy plan.",
                    )}
              </Text>
            )}
        </div>
      ))}
    </Stack>
  );
}
