import {
  Banner,
  Button,
  Card,
  ProgressBar,
  StatusBadge,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { OVERAGE_RATE, type BillingSummary } from "@portal/api/usage";
import { USD } from "@portal/components/usage/format";
import "@portal/views/Usage.css";

function BreakdownRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        "portal-usage__breakdown-row" +
        (emphasis ? " portal-usage__breakdown-row--total" : "")
      }
    >
      <span className="portal-usage__breakdown-label">{label}</span>
      <span className="portal-usage__breakdown-value">{value}</span>
    </div>
  );
}

/**
 * Current-plan summary card. The body adapts per tier: a cap meter + nudge on
 * free, a metered pay-as-you-go breakdown on pro, a committed-volume breakdown
 * on enterprise.
 */
export function CurrentPlanCard({
  summary,
  onUpgrade,
}: {
  summary: BillingSummary;
  onUpgrade: () => void;
}) {
  const { tier } = useTier();
  const usedRatio = summary.docsThisPeriod / summary.includedDocs;

  return (
    <Card padding="loose" className="portal-usage__plan-current">
      <div className="portal-usage__plan-current-head">
        <div>
          <span className="portal-usage__plan-eyebrow">Current plan</span>
          <h2 className="portal-usage__plan-name">{summary.planName}</h2>
        </div>
        <StatusBadge
          tone={
            tier === "enterprise"
              ? "purple"
              : tier === "pro"
                ? "info"
                : "neutral"
          }
          size="sm"
        >
          {tier === "free"
            ? "Free"
            : tier === "pro"
              ? "Pay-as-you-go"
              : "Committed"}
        </StatusBadge>
      </div>

      {tier === "free" && (
        <>
          <div className="portal-usage__cap">
            <div className="portal-usage__cap-row">
              <span>
                {summary.docsThisPeriod.toLocaleString()} /{" "}
                {summary.includedDocs.toLocaleString()} docs
              </span>
              <span className="portal-usage__cap-pct">
                {Math.round(usedRatio * 100)}%
              </span>
            </div>
            <ProgressBar
              value={usedRatio}
              thresholded
              height={8}
              label="Free plan usage"
            />
          </div>
          {summary.capReached ? (
            <Banner tone="danger" title="You've hit your free plan cap">
              New documents are paused until next cycle. Upgrade to keep
              processing without interruption.
            </Banner>
          ) : (
            <Banner tone="warning" title="Approaching your free plan cap">
              You're at {Math.round(usedRatio * 100)}% of 500 docs/month.
              Upgrade to pay-as-you-go to avoid a pause.
            </Banner>
          )}
        </>
      )}

      {tier === "pro" && (
        <div className="portal-usage__breakdown">
          <BreakdownRow
            label="Platform fee"
            value={USD.format(summary.monthlyFee)}
          />
          <BreakdownRow
            label="Included docs"
            value={`${summary.includedDocs.toLocaleString()}`}
          />
          <BreakdownRow
            label={`Overage · ${summary.overageDocs.toLocaleString()} docs @ $${OVERAGE_RATE.toFixed(2)}`}
            value={USD.format(summary.overageCost)}
          />
          <BreakdownRow
            label="Projected this month"
            value={USD.format(summary.costThisMonth)}
            emphasis
          />
        </div>
      )}

      {tier === "enterprise" && (
        <div className="portal-usage__breakdown">
          <BreakdownRow
            label="Committed volume"
            value={`${summary.includedDocs.toLocaleString()} docs/mo`}
          />
          <BreakdownRow
            label="Drawn this period"
            value={`${summary.docsThisPeriod.toLocaleString()} docs`}
          />
          <BreakdownRow
            label="Effective rate"
            value={`$${summary.overageRate.toFixed(3)} / doc`}
          />
          <BreakdownRow
            label="Monthly draw"
            value={USD.format(summary.monthlyFee)}
            emphasis
          />
        </div>
      )}

      <div className="portal-usage__plan-actions">
        {tier !== "enterprise" ? (
          <Button
            variant="gradient"
            accent={tier === "free" ? "blue" : "purple"}
            onClick={onUpgrade}
          >
            {tier === "free" ? "Upgrade plan" : "Talk to sales"}
          </Button>
        ) : (
          <Button variant="outline" accent="purple" onClick={onUpgrade}>
            Adjust commitment
          </Button>
        )}
        {/* TODO(backend): GET /v1/billing/invoices?format=pdf — bundle + download invoice PDFs. */}
        <Button variant="ghost" size="md">
          Download invoices
        </Button>
      </div>
    </Card>
  );
}
