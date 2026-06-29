import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@shared/components";
import { meterState } from "@shared/billing";
import type { Wallet } from "@portal/api/billing";
import type { LocalUsage } from "@portal/api/link";
import { useStripePortal } from "@portal/hooks/useStripePortal";
import { FreePdfEditorsCard } from "@portal/components/billing/FreePdfEditorsCard";
import { PdfsProcessedCard } from "@portal/components/billing/PdfsProcessedCard";
import { SpendThisMonthCard } from "@portal/components/billing/SpendThisMonthCard";
import { SpendLimitCard } from "@portal/components/billing/SpendLimitCard";
import { PaymentMethodCard } from "@portal/components/billing/PaymentMethodCard";
import { InvoicesList } from "@portal/components/billing/InvoicesList";

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
              ? t("billing.subscribedPlan.capWarn.reachedTitle")
              : t("billing.subscribedPlan.capWarn.approachingTitle", {
                  pct: Math.round(pct),
                })
          }
          action={
            isLeader ? (
              <Button size="sm" onClick={raiseLimit}>
                {t("billing.subscribedPlan.capWarn.raiseLimit")}
              </Button>
            ) : undefined
          }
        >
          {state === "DEGRADED"
            ? t("billing.subscribedPlan.capWarn.reachedBody")
            : t("billing.subscribedPlan.capWarn.approachingBody")}
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
          title={t("billing.subscribedPlan.portalError.title")}
        >
          {portal.error}
        </Banner>
      )}
    </div>
  );
}
