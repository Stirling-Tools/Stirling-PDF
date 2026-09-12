import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { meterState } from "@app/billing";
import type { Wallet } from "@portal/api/billing";
import type { LocalUsage } from "@portal/api/link";
import { useStripePortal } from "@portal/hooks/useStripePortal";
import { PdfsProcessedCard } from "@portal/components/billing/PdfsProcessedCard";
import { PrepaidCapacityCard } from "@portal/components/billing/PrepaidCapacityCard";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import { SpendLimitCard } from "@portal/components/billing/SpendLimitCard";

interface Props {
  wallet: Wallet;
  /** Instance-local usage not yet synced to SaaS; folded into the PDFs-processed card. */
  unsynced?: LocalUsage | null;
  onWalletChange?: () => void;
  /**
   * Whether the spend-limit editor is open, when the host drives it. Lets the Processor row's
   * "Raise limit" door reach the control that already exists here.
   */
  adjusting?: boolean;
  onAdjustingChange?: (adjusting: boolean) => void;
}

/**
 * What a subscribed team needs beyond {@link BillingScreen}: prepaid capacity, the per-category
 * split of what was processed, the leader-only spend-limit editor, and the bundle checkout. The
 * fleet count, invoices and the payment method are not repeated here; the shared screen states
 * those already.
 */
export function SubscribedPlanView({
  wallet,
  unsynced,
  onWalletChange,
  adjusting: controlledAdjusting,
  onAdjustingChange,
}: Props) {
  const { t } = useTranslation();
  const [ownAdjusting, setOwnAdjusting] = useState(false);
  const adjusting = onAdjustingChange
    ? (controlledAdjusting ?? false)
    : ownAdjusting;
  const setAdjusting = onAdjustingChange ?? setOwnAdjusting;
  const [bundleOpen, setBundleOpen] = useState(false);
  const portal = useStripePortal(wallet);

  const isLeader = wallet.role === "leader";
  const split = wallet.categoryDocs;
  const hasCategorySplit = split.api + split.ai + split.automation > 0;
  // Buying/topping up prepaid capacity is a commercial action — leader-only, and
  // needs a resolved team to scope checkout.
  const canBuyBundle = isLeader && wallet.teamId != null;
  const spent =
    wallet.estimatedBillMinor != null ? wallet.estimatedBillMinor / 100 : 0;
  const capActive = !wallet.noCap && wallet.capUsd != null;
  const { state, pct } = meterState(spent, wallet.capUsd ?? 0);
  const showCapWarn = capActive && state !== "FULL";

  function raiseLimit() {
    setAdjusting(true);
    document
      .getElementById("portal-spend-limit")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="portal-billing__stack">
      {showCapWarn && (
        <Banner
          tone={state === "DEGRADED" ? "danger" : "warning"}
          title={
            state === "DEGRADED"
              ? t(
                  "portal.billing.subscribedPlan.capWarn.reachedTitle",
                  "Monthly spend limit reached",
                )
              : t(
                  "portal.billing.subscribedPlan.capWarn.approachingTitle",
                  "You're at {{pct}}% of your monthly spend limit",
                  {
                    pct: Math.round(pct),
                  },
                )
          }
          action={
            isLeader ? (
              <Button size="sm" onClick={raiseLimit}>
                {t(
                  "portal.billing.subscribedPlan.capWarn.raiseLimit",
                  "Raise limit",
                )}
              </Button>
            ) : undefined
          }
        >
          {state === "DEGRADED"
            ? t(
                "portal.billing.subscribedPlan.capWarn.reachedBody",
                "Metered processing is paused until you raise the limit or the cycle resets. Unlimited PDF editing keeps working.",
              )
            : t(
                "portal.billing.subscribedPlan.capWarn.approachingBody",
                "Raise it now so automated processing never pauses.",
              )}
        </Banner>
      )}

      <PrepaidCapacityCard
        wallet={wallet}
        onBuy={canBuyBundle ? () => setBundleOpen(true) : undefined}
      />

      {/* Only when there is a split to show. The total on its own is already a cycle row on the
          shared screen, so an empty-split card would just print it twice. */}
      {hasCategorySplit && (
        <PdfsProcessedCard wallet={wallet} unsynced={unsynced} />
      )}

      {/* The limit control, which is interactive and has no equivalent on the shared card. */}
      <SpendLimitCard
        wallet={wallet}
        onWalletChange={onWalletChange}
        adjusting={adjusting}
        onAdjustingChange={setAdjusting}
      />

      {portal.error && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.subscribedPlan.portalError.title",
            "Couldn't open Stripe portal",
          )}
        >
          {portal.error}
        </Banner>
      )}

      {canBuyBundle && (
        <BundleCheckoutModal
          open={bundleOpen}
          onClose={() => setBundleOpen(false)}
          wallet={wallet}
          onComplete={onWalletChange}
        />
      )}
    </div>
  );
}
