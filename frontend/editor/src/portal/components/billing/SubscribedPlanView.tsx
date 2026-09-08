import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { meterState } from "@app/billing";
import type { Wallet } from "@portal/api/billing";
import type { LocalUsage } from "@portal/api/link";
import { useStripePortal } from "@portal/hooks/useStripePortal";
import { FreePdfEditorsCard } from "@portal/components/billing/FreePdfEditorsCard";
import { PdfsProcessedCard } from "@portal/components/billing/PdfsProcessedCard";
import { PrepaidCapacityCard } from "@portal/components/billing/PrepaidCapacityCard";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import { SpendLimitCard } from "@portal/components/billing/SpendLimitCard";
import { PaymentMethodCard } from "@portal/components/billing/PaymentMethodCard";
import { InvoicesList } from "@portal/components/billing/InvoicesList";

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
 * Linked + subscribed — the full Processor-plan dashboard, matching the
 * marketing layout and reusing the free view's building blocks:
 *   - team editor fleet ({@link FreePdfEditorsCard}, shared with the free view)
 *   - PDFs processed + category split ({@link PdfsProcessedCard})
 *   - spend-vs-cap meter, projection, and the leader-only cap editor
 *     ({@link SpendLimitCard} → shared {@code SpendCapControl})
 *   - Enterprise upsell ({@link EnterpriseUpsell}, shared with the free view)
 *   - per-member usage, Stripe invoices, and the default payment method
 *
 * Card / subscription management lives in Stripe's hosted portal — both the
 * page-header "Manage Payment" action and the payment card's "Update" button
 * deep-link there via {@link useStripePortal}.
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

      <FreePdfEditorsCard />

      <PrepaidCapacityCard
        wallet={wallet}
        onBuy={canBuyBundle ? () => setBundleOpen(true) : undefined}
      />

      <PdfsProcessedCard wallet={wallet} unsynced={unsynced} />

      {/* Spend for the period is BillingScreen's ProcessorPlanCard now; what stays here is the
          limit control, which is interactive and has no equivalent on the shared card. */}
      <div className="portal-billing__spend-row">
        <SpendLimitCard
          wallet={wallet}
          onWalletChange={onWalletChange}
          adjusting={adjusting}
          onAdjustingChange={setAdjusting}
        />
      </div>

      <InvoicesList />

      <PaymentMethodCard onManage={portal.open} managing={portal.opening} />

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
