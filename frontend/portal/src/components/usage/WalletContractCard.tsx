import {
  Card,
  MetricCard,
  MetricStrip,
  StatusBadge,
  type StatusTone,
} from "@shared/components";
import type {
  EntitlementState,
  SubscriptionStatus,
  WalletContract,
} from "@portal/api/usage";
import "@portal/views/Usage.css";

const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  none: "No subscription",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, StatusTone> = {
  none: "neutral",
  active: "success",
  past_due: "warning",
  canceled: "danger",
};

const STATE_TONE: Record<EntitlementState, StatusTone> = {
  FULL: "success",
  WARNED: "warning",
  DEGRADED: "danger",
};

const STATE_LABEL: Record<EntitlementState, string> = {
  FULL: "Full service",
  WARNED: "Approaching limit",
  DEGRADED: "Degraded",
};

const num = new Intl.NumberFormat();

/**
 * Live wallet contract — the real PAYG/account-link billing facts the local
 * gate enforces against (subscription, free pool, period spend/cap, state).
 * Distinct from the doc-count demo cards: this is the canonical billing shape
 * served verbatim once the real backend is wired.
 */
export function WalletContractCard({
  wallet,
}: {
  wallet: WalletContract;
}) {
  return (
    <Card padding="loose" className="portal-usage__wallet">
      <div className="portal-usage__wallet-head">
        <div>
          <span className="portal-usage__plan-eyebrow">Wallet</span>
          <h2 className="portal-usage__plan-name">Account-link entitlement</h2>
        </div>
        <div className="portal-usage__wallet-badges">
          <StatusBadge tone={SUBSCRIPTION_TONE[wallet.subscriptionStatus]} size="sm">
            {SUBSCRIPTION_LABEL[wallet.subscriptionStatus]}
          </StatusBadge>
          <StatusBadge
            tone={STATE_TONE[wallet.state]}
            size="sm"
            pulse={wallet.state !== "FULL"}
          >
            {STATE_LABEL[wallet.state]}
          </StatusBadge>
        </div>
      </div>

      <MetricStrip>
        <MetricCard
          label="Free units remaining"
          value={num.format(wallet.freeUnitsRemaining)}
          description="one-time grant"
        />
        <MetricCard
          label="Period spend"
          value={`${num.format(wallet.periodSpend)} units`}
          description="this billing window"
        />
        <MetricCard
          label="Monthly cap"
          value={
            wallet.monthlyCapUnits == null
              ? "Uncapped"
              : `${num.format(wallet.monthlyCapUnits)} units`
          }
          description={wallet.monthlyCapUnits == null ? "no ceiling set" : "paid ceiling"}
        />
      </MetricStrip>
    </Card>
  );
}
