import { Switch } from "@mantine/core";
import type { SpendLimit, BillingTier } from "@app/types/policies";

interface PolicyBillingBarProps {
  activePolicyCount: number;
  perDocCost: number;
  tier: BillingTier;
  spendLimit: SpendLimit;
  setSpendLimit: (s: SpendLimit) => void;
  spendLimitReached: boolean;
  spendLimitWarning: boolean;
}

/** Per-document cost + spend-limit control shown under the policy list. */
export function PolicyBillingBar({
  activePolicyCount,
  perDocCost,
  tier,
  spendLimit,
  setSpendLimit,
  spendLimitReached,
  spendLimitWarning,
}: PolicyBillingBarProps) {
  return (
    <div className="pol-billing">
      <div className="pol-billing-cost">
        <span className="pol-billing-amount">${perDocCost.toFixed(2)}</span>
        <span className="pol-billing-unit">
          / document · {activePolicyCount} active
        </span>
        {tier === "free" && <span className="pol-billing-tier">Free</span>}
      </div>

      <div className="pol-billing-limit">
        <Switch
          size="xs"
          checked={spendLimit.enabled}
          onChange={(e) =>
            setSpendLimit({ ...spendLimit, enabled: e.currentTarget.checked })
          }
          label="Spend limit"
          styles={{ label: { fontSize: 11 } }}
        />
        {spendLimit.enabled && (
          <div className="pol-billing-limit-row">
            <span>$</span>
            <input
              className="pol-billing-input"
              type="number"
              min={0}
              value={spendLimit.limit}
              onChange={(e) =>
                setSpendLimit({
                  ...spendLimit,
                  limit: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
            <span className="pol-billing-period">/ {spendLimit.period}</span>
          </div>
        )}
      </div>

      {spendLimit.enabled && (spendLimitReached || spendLimitWarning) && (
        <p
          className={`pol-billing-warn${spendLimitReached ? " is-reached" : ""}`}
        >
          {spendLimitReached
            ? "Spend limit reached — enforcement paused."
            : "Approaching spend limit."}
        </p>
      )}
    </div>
  );
}
