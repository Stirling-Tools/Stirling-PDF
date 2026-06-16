import { useState } from "react";
import { Button, Card, ProgressBar, Slider, StatusBadge } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import type { BillingSummary } from "@portal/api/usage";
import { USD } from "@portal/components/usage/format";
import "@portal/views/Usage.css";

/**
 * Monthly spend-cap control. Only pay-as-you-go can accrue spend, so free and
 * enterprise render explanatory cards instead of the interactive slider.
 */
export function SpendCapControl({ summary }: { summary: BillingSummary }) {
  const { tier } = useTier();
  const [enabled, setEnabled] = useState(summary.spendCap !== null);
  const [cap, setCap] = useState(summary.spendCap ?? 1_000);

  if (tier === "free") {
    return (
      <Card padding="loose" className="portal-usage__cap-card">
        <h2 className="portal-usage__section-title">Spend cap</h2>
        <p className="portal-usage__section-sub">
          The free plan can't accrue spend — your usage is hard-capped at 500
          docs/month. Upgrade to pay-as-you-go to set a monthly spend cap.
        </p>
      </Card>
    );
  }

  if (tier === "enterprise") {
    return (
      <Card padding="loose" className="portal-usage__cap-card">
        <h2 className="portal-usage__section-title">Spend controls</h2>
        <p className="portal-usage__section-sub">
          Spend is governed by your committed-volume contract. Overage terms
          and alert thresholds are managed with your account team.
        </p>
        <div className="portal-usage__cap-meta">
          <StatusBadge tone="purple" size="sm">
            Committed contract
          </StatusBadge>
          <span>Overage billed at ${summary.overageRate.toFixed(3)}/doc</span>
        </div>
      </Card>
    );
  }

  const projected = summary.costThisMonth;
  const capRatio = enabled ? Math.min(projected / cap, 1) : 0;

  // TODO(backend): PUT /v1/billing/spend-cap { enabled, cap } — persist the cap
  // so processing pauses server-side when projected spend reaches the limit.
  return (
    <Card padding="loose" className="portal-usage__cap-card">
      <div className="portal-usage__cap-card-head">
        <div>
          <h2 className="portal-usage__section-title">Monthly spend cap</h2>
          <p className="portal-usage__section-sub">
            Pause processing automatically when spend reaches your limit.
          </p>
        </div>
        <Button
          variant={enabled ? "outline" : "gradient"}
          size="sm"
          onClick={() => setEnabled((v) => !v)}
        >
          {enabled ? "Disable cap" : "Enable cap"}
        </Button>
      </div>

      {enabled && (
        <>
          <div className="portal-usage__cap-slider">
            <Slider
              value={cap}
              min={500}
              max={10_000}
              step={250}
              onChange={setCap}
              formatValue={(v) => USD.format(v)}
            />
          </div>
          <div className="portal-usage__cap-row">
            <span>
              Projected {USD.format(projected)} of {USD.format(cap)} cap
            </span>
            <span className="portal-usage__cap-pct">
              {Math.round(capRatio * 100)}%
            </span>
          </div>
          <ProgressBar
            value={capRatio}
            thresholded
            height={8}
            label="Spend against cap"
          />
        </>
      )}
    </Card>
  );
}
