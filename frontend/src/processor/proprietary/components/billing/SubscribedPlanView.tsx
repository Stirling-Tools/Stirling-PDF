import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@editor/ui";
import { meterState } from "@editor/billing";
import type { Wallet } from "@processor/api/billing";
import type { LocalUsage } from "@processor/api/link";
import { useStripePortal } from "@processor/hooks/useStripePortal";
import { FreePdfEditorsCard } from "@processor/components/billing/FreePdfEditorsCard";
import { PdfsProcessedCard } from "@processor/components/billing/PdfsProcessedCard";
import { SpendThisMonthCard } from "@processor/components/billing/SpendThisMonthCard";
import { SpendLimitCard } from "@processor/components/billing/SpendLimitCard";
import { PaymentMethodCard } from "@processor/components/billing/PaymentMethodCard";
import { InvoicesList } from "@processor/components/billing/InvoicesList";

interface Props {
  wallet: Wallet;
  /** Instance-local usage not yet synced to SaaS; folded into the PDFs-processed card. */
  unsynced?: LocalUsage | null;
  onWalletChange?: () => void;
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
}: Props) {
  const { t } = useTranslation();
  const [adjusting, setAdjusting] = useState(false);
  const portal = useStripePortal(wallet);

  const isLeader = wallet.role === "leader";
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

      <PdfsProcessedCard wallet={wallet} unsynced={unsynced} />

      <div className="portal-billing__spend-row">
        <SpendThisMonthCard wallet={wallet} />
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
    </div>
  );
}
