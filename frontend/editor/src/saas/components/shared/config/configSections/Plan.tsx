/**
 * SaaS "Plan" page — the single entry point for billing, plan state, and
 * usage. Branches on the team's wallet state and the viewer's role:
 *
 *   - free + leader → {@link PaygFreeLeader} (upgrade CTA + manual-tools
 *     framing)
 *   - free + member → {@link PaygFreeMember} (ask-the-owner note)
 *   - subscribed + leader → {@link PaygLeader} (full dashboard, editable cap)
 *   - subscribed + member → {@link PaygMember} (member dashboard)
 *
 * <p>The hook handles loading + error states locally so the four view
 * components stay focused on rendering the data they own. {@code Plan} is
 * intentionally tiny (under 60 lines) so future "Plan-level" affordances —
 * a top-level error toast, a subscription confirmation card, etc — have
 * obvious places to land.
 */
import React, { useCallback } from "react";
import { Alert, Center, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useWallet } from "@app/hooks/useWallet";
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

  if (loading && !wallet) {
    return (
      <Center mih={200}>
        <Loader />
      </Center>
    );
  }

  if (error || !wallet) {
    return (
      <Alert
        color="red"
        title={t("payg.error.title", "Couldn't load your plan")}
      >
        {error ??
          t(
            "payg.error.body",
            "We couldn't reach the billing service. Refresh the page to try again.",
          )}
      </Alert>
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

  // Free tier — only the leader sees the upgrade CTA.
  if (wallet.role === "leader") {
    return <PaygFreeLeader onUpgraded={onUpgraded} />;
  }
  return <PaygFreeMember />;
};

export default Plan;
