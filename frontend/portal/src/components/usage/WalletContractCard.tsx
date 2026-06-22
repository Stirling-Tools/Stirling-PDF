import {
  Card,
  ProgressBar,
  SectionDivider,
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

// One-time free grant size, for the remaining-PDFs meter on unsubscribed wallets.
const FREE_GRANT = 500;

const num = new Intl.NumberFormat();

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="portal-usage__breakdown-row">
      <span className="portal-usage__breakdown-label">{label}</span>
      <span className="portal-usage__breakdown-value">{value}</span>
    </div>
  );
}

/**
 * Live wallet contract — the real PAYG/account-link billing facts the local gate
 * enforces against (subscription, free pool, period spend/cap, state). Styled to
 * match the SaaS Plan page: eyebrow + plan name header, a hero metric, a hairline
 * divider, then a dimmed breakdown. Distinct from the doc-count demo cards: this
 * is the canonical billing shape served verbatim once the real backend is wired.
 */
export function WalletContractCard({
  wallet,
}: {
  wallet: WalletContract;
}) {
  const subscribed = wallet.subscriptionStatus === "active";
  const freeUsedRatio = (FREE_GRANT - wallet.freeUnitsRemaining) / FREE_GRANT;

  return (
    <Card padding="loose" className="portal-usage__wallet">
      <div className="portal-usage__wallet-head">
        <div>
          <span className="portal-usage__plan-eyebrow">Wallet</span>
          <h2 className="portal-usage__plan-name">Account-link entitlement</h2>
        </div>
        <div className="portal-usage__wallet-badges">
          <StatusBadge
            tone={SUBSCRIPTION_TONE[wallet.subscriptionStatus]}
            size="sm"
          >
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

      {/* Hero metric — like the plan-card price block. */}
      <div className="portal-usage__wallet-hero">
        <span className="portal-usage__wallet-hero-value">
          {subscribed
            ? num.format(wallet.periodSpend)
            : num.format(wallet.freeUnitsRemaining)}
        </span>
        <span className="portal-usage__wallet-hero-unit">
          {subscribed ? "PDFs this period" : "Free PDFs remaining"}
        </span>
      </div>

      {!subscribed && (
        <ProgressBar
          value={freeUsedRatio}
          thresholded
          height={8}
          label="Free grant usage"
        />
      )}

      <SectionDivider spacing={4} />

      <div className="portal-usage__breakdown">
        {subscribed ? (
          <>
            <Row
              label="Monthly cap"
              value={
                wallet.monthlyCapUnits == null
                  ? "Uncapped"
                  : `${num.format(wallet.monthlyCapUnits)} PDFs`
              }
            />
            <Row
              label="Free PDFs remaining"
              value={num.format(wallet.freeUnitsRemaining)}
            />
          </>
        ) : (
          <>
            <Row label="Free grant" value={`${num.format(FREE_GRANT)} PDFs`} />
            <Row
              label="PDFs this period"
              value={num.format(wallet.periodSpend)}
            />
          </>
        )}
      </div>
    </Card>
  );
}
