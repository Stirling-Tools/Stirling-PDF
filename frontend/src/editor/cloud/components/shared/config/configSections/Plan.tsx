/** Account-owned legacy billing can coexist with the current team's wallet. */
import React, { useCallback } from "react";
import { Center, Group, Loader, Stack } from "@mantine/core";
import { Banner, Button } from "@app/ui";
import { useTranslation } from "react-i18next";
import { useWallet } from "@app/hooks/useWallet";
import { useLegacySubscriptions } from "@app/hooks/useLegacySubscriptions";
import { LegacySubscriptionPlan } from "@app/components/shared/config/LegacySubscriptionPlan";
import { useRenderCount } from "@app/hooks/useRenderCount";
import {
  PaygLeader,
  PaygMember,
} from "@app/components/shared/config/configSections/Payg";
import {
  PaygFreeLeader,
  PaygFreeMember,
} from "@app/components/shared/config/configSections/PaygFree";

const Plan: React.FC = () => {
  useRenderCount("Plan");
  const { t } = useTranslation();
  const legacyBilling = useLegacySubscriptions();
  const hasLegacyBilling =
    legacyBilling.loading ||
    legacyBilling.loadError ||
    legacyBilling.subscriptions.length > 0;
  const { wallet, loading, error, markSubscribed, updateCap, openPortal } =
    useWallet();

  // Stable callback so PaygFreeLeader's React.memo doesn't see a new prop
  // identity on every Plan render (e.g. loading flips false→true→false on
  // a refetch). Closing over the stable markSubscribed from useWallet
  // means we don't need to add wallet state to deps.
  const onUpgraded = useCallback(
    ({ capUsd }: { capUsd: number | null }) => {
      // Bridges the modal's local success → backend mock → refetch loop.
      // Real Stripe flow: the customer.subscription.created webhook is
      // what flips status; we still call markSubscribed locally so the
      // optimistic refetch hits immediately.
      void markSubscribed(capUsd);
    },
    [markSubscribed],
  );

  const renderWallet = () => {
    if (loading && !wallet) {
      return (
        <Center mih={200}>
          <Loader />
        </Center>
      );
    }

    if (error || !wallet) {
      return (
        <Banner
          tone="danger"
          title={t("payg.error.title", "Couldn't load your plan")}
        >
          {error ??
            t(
              "payg.error.body",
              "We couldn't reach the billing service. Refresh the page to try again.",
            )}
        </Banner>
      );
    }

    if (wallet.status === "subscribed") {
      return wallet.role === "leader" ? (
        <PaygLeader
          wallet={wallet}
          onSaveCap={updateCap}
          onOpenPortal={openPortal}
        />
      ) : (
        <PaygMember wallet={wallet} />
      );
    }

    if (hasLegacyBilling) return null;

    // Free tier — only the leader sees the upgrade CTA.
    if (wallet.role === "leader") {
      return <PaygFreeLeader onUpgraded={onUpgraded} />;
    }
    return <PaygFreeMember />;
  };

  return (
    <Stack>
      {legacyBilling.subscriptions.length > 0 && (
        <Group justify="flex-end">
          <Button
            variant="secondary"
            onClick={legacyBilling.openPortal}
            disabled={legacyBilling.opening}
          >
            {t("payment.manageSubscription", "Manage subscription")}
          </Button>
        </Group>
      )}
      {legacyBilling.portalError && (
        <Banner tone="danger">
          {t(
            "legacyBilling.portalError",
            "We couldn't open Stripe billing. Please try again.",
          )}
        </Banner>
      )}
      <LegacySubscriptionPlan billing={legacyBilling} />
      {renderWallet()}
    </Stack>
  );
};

export default Plan;
