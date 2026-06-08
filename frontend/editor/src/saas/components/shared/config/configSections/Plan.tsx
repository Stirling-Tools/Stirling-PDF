/**
 * SaaS "Plan" page — the single entry point for billing, plan state, and
 * usage. Replaces the old multi-tier (Pro / Business / Enterprise + credit
 * pack) layout: PAYG is the only plan model now. The page branches on the
 * team's wallet state and the viewer's role:
 *
 *   - free + leader → {@link PaygFreeLeader} (upgrade CTA + manual-tools
 *     framing)
 *   - free + member → {@link PaygFreeMember} (ask-the-owner note)
 *   - subscribed + leader → {@link PaygLeader} (full dashboard, editable cap)
 *   - subscribed + member → {@link PaygMember} (member dashboard)
 *
 * <p>Subscription state and role come from {@link useWallet}. When the
 * UpgradeModal completes, we call {@code markSubscribed()} to flip the view
 * immediately — real wiring later swaps this for a wallet refetch.
 */
import React from "react";
import { useWallet } from "@app/hooks/useWallet";
import {
  PaygLeader,
  PaygMember,
} from "@app/components/shared/config/configSections/Payg";
import {
  PaygFreeLeader,
  PaygFreeMember,
} from "@app/components/shared/config/configSections/PaygFree";

const Plan: React.FC = () => {
  const { wallet, markSubscribed } = useWallet();

  if (wallet.status === "subscribed") {
    return wallet.role === "leader" ? <PaygLeader /> : <PaygMember />;
  }

  // Free tier
  if (wallet.role === "leader") {
    return (
      <PaygFreeLeader
        onUpgraded={() => {
          // Real wiring: refetch wallet from /api/v1/payg/wallet. Until then,
          // optimistically flip the local cache so the view rerenders into
          // the subscribed dashboard.
          markSubscribed();
        }}
      />
    );
  }
  return <PaygFreeMember />;
};

export default Plan;
