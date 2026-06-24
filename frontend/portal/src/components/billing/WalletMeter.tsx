import { Card, StatusBadge } from "@shared/components";
import type { Wallet } from "@portal/api/billing";

interface Props {
  wallet: Wallet;
}

function formatMoney(minor: number | null, currency: string | null): string {
  if (minor == null) return "—";
  const code = (currency ?? "usd").toUpperCase();
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${code}`;
  }
}

function formatRate(perDocMinor: number | null, currency: string | null): string {
  if (perDocMinor == null) return "—";
  return `${formatMoney(perDocMinor, currency)}/PDF`;
}

/**
 * Headline meter card. Subscribed: this-period spend, estimated bill, cap.
 * Free: lifetime free pool used + remaining. Same component, two faces — the
 * billing page renders one or the other based on wallet.status.
 */
export function WalletMeter({ wallet }: Props) {
  const subscribed = wallet.status === "subscribed";
  const usedPct =
    wallet.billableLimit && wallet.billableLimit > 0
      ? Math.min(100, (wallet.billableUsed / wallet.billableLimit) * 100)
      : null;

  return (
    <Card padding="loose">
      <div className="portal-billing__meter-head">
        <div>
          <span className="portal-billing__eyebrow">
            {subscribed ? "This period" : "Free grant"}
          </span>
          <h2 className="portal-billing__meter-title">
            {subscribed ? "PDFs processed this period" : "Lifetime free grant"}
          </h2>
        </div>
        <StatusBadge
          tone={subscribed ? "success" : "info"}
          size="md"
        >
          {subscribed ? "Pay-as-you-go" : "Free"}
        </StatusBadge>
      </div>

      <div className="portal-billing__meter-figures">
        <div className="portal-billing__meter-figure">
          <span className="portal-billing__meter-num">
            {wallet.billableUsed.toLocaleString()}
          </span>
          <span className="portal-billing__meter-label">
            {subscribed ? "PDFs processed" : "PDFs used"}
          </span>
        </div>
        {wallet.billableLimit != null && (
          <div className="portal-billing__meter-figure">
            <span className="portal-billing__meter-num portal-billing__meter-num--muted">
              of {wallet.billableLimit.toLocaleString()}
            </span>
            <span className="portal-billing__meter-label">
              {subscribed
                ? `Capped at ${formatMoney((wallet.capUsd ?? 0) * 100, wallet.currency ?? "usd")}/period`
                : "free PDFs total"}
            </span>
          </div>
        )}
        {subscribed && wallet.estimatedBillMinor != null && (
          <div className="portal-billing__meter-figure">
            <span className="portal-billing__meter-num">
              {formatMoney(wallet.estimatedBillMinor, wallet.currency)}
            </span>
            <span className="portal-billing__meter-label">
              estimated · {formatRate(wallet.pricePerDocMinor, wallet.currency)}
            </span>
          </div>
        )}
        {!subscribed && (
          <div className="portal-billing__meter-figure">
            <span className="portal-billing__meter-num">
              {wallet.freeRemaining.toLocaleString()}
            </span>
            <span className="portal-billing__meter-label">remaining</span>
          </div>
        )}
      </div>

      {usedPct != null && (
        <div
          className="portal-billing__meter-track"
          role="progressbar"
          aria-valuenow={Math.round(usedPct)}
          aria-valuemax={100}
        >
          <div
            className="portal-billing__meter-fill"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      )}

      <p className="portal-billing__meter-foot">
        {subscribed
          ? `Period: ${wallet.billingPeriodStart} → ${wallet.billingPeriodEnd}. Free portion was netted out at charge time; the Stripe invoice is authoritative.`
          : "Manual PDF editing — view, sign, merge, split, watermark, compress, convert, manual OCR — stays free forever, no matter how many PDFs you touch. The free grant only applies to automation, AI, and API."}
      </p>
    </Card>
  );
}
