import { Card } from "@shared/components";
import type { WalletCategoryBreakdown } from "@portal/api/billing";

interface Props {
  breakdown: WalletCategoryBreakdown;
  /** Hide when there's nothing to show. */
  totalSpend: number;
}

/**
 * Where the team's billable PDFs went this period. Three slices (API, AI,
 * Automation) — the same buckets the entitlement service tracks. No time
 * series here yet (deferred until SaaS exposes a usage-by-day endpoint).
 */
export function CategoryBreakdownPanel({ breakdown, totalSpend }: Props) {
  if (totalSpend <= 0) return null;
  const total = Math.max(1, breakdown.api + breakdown.ai + breakdown.automation);
  const rows: Array<{ key: string; label: string; value: number; tone: string }> = [
    { key: "api", label: "API", value: breakdown.api, tone: "blue" },
    { key: "ai", label: "AI", value: breakdown.ai, tone: "purple" },
    {
      key: "automation",
      label: "Automation",
      value: breakdown.automation,
      tone: "teal",
    },
  ];
  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">Where it went</span>
      <h3 className="portal-billing__section-title">By category</h3>
      <div className="portal-billing__breakdown">
        {rows.map((r) => {
          const pct = (r.value / total) * 100;
          return (
            <div key={r.key} className="portal-billing__breakdown-row">
              <div className="portal-billing__breakdown-head">
                <span className="portal-billing__breakdown-label">{r.label}</span>
                <span className="portal-billing__breakdown-value">
                  {r.value.toLocaleString()} PDFs
                </span>
              </div>
              <div className="portal-billing__breakdown-track">
                <div
                  className={`portal-billing__breakdown-fill portal-billing__breakdown-fill--${r.tone}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
