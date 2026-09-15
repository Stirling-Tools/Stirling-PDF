import { estimatedBillWithPending } from "@app/billing/pendingUsage";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { meterState } from "@app/billing";
import type { Wallet } from "@processor/api/billing";
import { useStripePortal } from "@processor/hooks/useStripePortal";
import { BundleCheckoutModal } from "@processor/components/billing/BundleCheckoutModal";
import { SpendLimitModal } from "@processor/components/billing/SpendLimitModal";

interface Props {
  wallet: Wallet;
  pendingUnits?: number;
  onWalletChange?: () => void;
  /**
   * Whether the spend-limit editor is open, when the host drives it. Lets the Processor row's
   * "Raise limit" door reach the control that already exists here.
   */
  adjusting?: boolean;
  onAdjustingChange?: (adjusting: boolean) => void;
}

/**
 * The flows a subscribed team needs that {@link BillingScreen} has no room for: the spend-limit
 * dialog its Processor row opens, and the bundle checkout.
 *
 * <p>Nothing renders here at rest. Every card this view used to stack under the page either
 * restated the screen above it or was an upsell, and both now live inside a dialog or not at all.
 */
export function SubscribedPlanView({
  wallet,
  pendingUnits = 0,
  onWalletChange,
  adjusting: controlledAdjusting,
  onAdjustingChange,
}: Props) {
  const { t } = useTranslation();
  const estimatedMinor = estimatedBillWithPending(wallet, pendingUnits);
  const [ownAdjusting, setOwnAdjusting] = useState(false);
  const adjusting = onAdjustingChange
    ? (controlledAdjusting ?? false)
    : ownAdjusting;
  const setAdjusting = onAdjustingChange ?? setOwnAdjusting;
  const [bundleOpen, setBundleOpen] = useState(false);
  const processor = useStripePortal(wallet);

  const isLeader = wallet.role === "leader";
  // Buying/topping up prepaid capacity is a commercial action — leader-only, and
  // needs a resolved team to scope checkout.
  const canBuyBundle = isLeader && wallet.teamId != null;
  const spent = estimatedMinor != null ? estimatedMinor / 100 : 0;
  const capActive = !wallet.noCap && wallet.capUsd != null;
  const { state, pct } = meterState(spent, wallet.capUsd ?? 0);
  const showCapWarn = capActive && state !== "FULL";

  function raiseLimit() {
    setAdjusting(true);
  }

  return (
    <div className="processor-billing__stack">
      {showCapWarn && (
        <Banner
          tone={state === "DEGRADED" ? "danger" : "warning"}
          title={
            state === "DEGRADED"
              ? t(
                  "processor.billing.subscribedPlan.capWarn.reachedTitle",
                  "Monthly spend limit reached",
                )
              : t(
                  "processor.billing.subscribedPlan.capWarn.approachingTitle",
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
                  "processor.billing.subscribedPlan.capWarn.raiseLimit",
                  "Raise limit",
                )}
              </Button>
            ) : undefined
          }
        >
          {state === "DEGRADED"
            ? t(
                "processor.billing.subscribedPlan.capWarn.reachedBody",
                "Metered processing is paused until you raise the limit or the cycle resets. Unlimited PDF editing keeps working.",
              )
            : t(
                "processor.billing.subscribedPlan.capWarn.approachingBody",
                "Raise it now so automated processing never pauses.",
              )}
        </Banner>
      )}

      <SpendLimitModal
        open={adjusting}
        onClose={() => setAdjusting(false)}
        wallet={wallet}
        onWalletChange={onWalletChange}
        onBuyBundle={canBuyBundle ? () => setBundleOpen(true) : undefined}
      />

      {processor.error && (
        <Banner
          tone="danger"
          title={t(
            "processor.billing.subscribedPlan.portalError.title",
            "Couldn't open Stripe portal",
          )}
        >
          {processor.error}
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
