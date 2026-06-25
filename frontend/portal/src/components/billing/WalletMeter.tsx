import { Card } from "@shared/components";
import {
  currencySymbol,
  formatMoneyMajor,
  formatPeriodDate,
  MeterBar,
  meterState,
} from "@shared/billing";
import type { Wallet } from "@portal/api/billing";

interface Props {
  wallet: Wallet;
}

/**
 * Headline meter card. Matches the SaaS `FreeMeterPanel` visual treatment
 * (same `paygf-meter` + `payg-bar` + `payg-status` class structure, so the
 * styling is interchangeable with the cloud plan page).
 *
 * Two faces:
 *   - free                → "X / N free PDFs" (uses freeAllowance + freeRemaining)
 *   - subscribed (no cap) → "X PDFs processed this period" (estimated bill only,
 *                            no bar — uncapped)
 *   - subscribed (capped) → "$spent / $cap" against the configured cap
 */
export function WalletMeter({ wallet }: Props) {
  const subscribed = wallet.status === "subscribed";

  if (!subscribed) {
    // Editor-plan free-grant view: lifetime grant, 500 PDFs by default.
    const { state, pct } = meterState(wallet.billableUsed, wallet.freeAllowance);
    const stateLabel =
      state === "DEGRADED"
        ? "Limit reached"
        : state === "WARNED"
          ? "Approaching limit"
          : "Plenty left";
    return (
      <Card padding="loose">
        <span className="portal-billing__eyebrow">Editor plan · Always free</span>
        <h2 className="portal-billing__meter-title">
          One-time free grant
        </h2>
        <MeterBar
          state={state}
          pct={pct}
          figure={wallet.billableUsed.toLocaleString()}
          capSuffix={`/ ${wallet.freeAllowance.toLocaleString()} free PDFs`}
          statusLabel={stateLabel}
          meta={<span>Automation · AI · API requests</span>}
        />
        <p className="portal-billing__meter-foot">
          Manual PDF editing — view, sign, merge, split, watermark, compress,
          convert, manual OCR — is always free.
        </p>
      </Card>
    );
  }

  // Subscribed (Processor plan): the meter lives in the merged PlanHeadCard now,
  // so WalletMeter is only the free face. Render the subscribed meter standalone
  // for completeness (e.g. if ever used outside the plan-head card).
  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">Processor plan · metered</span>
      <h2 className="portal-billing__meter-title">This period</h2>
      <SubscribedMeter wallet={wallet} />
    </Card>
  );
}

/**
 * Bodiless spend-vs-cap meter for a subscribed team — the "$X / $cap" figure,
 * status chip, bar, and period line, plus the estimate caveat. No Card wrapper
 * so it can be embedded inside the merged PlanHeadCard (the period meter and
 * the free/metered split are one "active Processor plan" surface).
 */
export function SubscribedMeter({ wallet }: { wallet: Wallet }) {
  const spent =
    wallet.estimatedBillMinor != null ? wallet.estimatedBillMinor / 100 : 0;
  const cap = wallet.capUsd ?? 0;
  const capActive = !wallet.noCap && cap > 0;
  const { state, pct } = meterState(spent, cap);
  // Only surface the status chip when it's actionable — i.e. capped and
  // approaching/at the cap. A green "Healthy" or "Uncapped" badge is just noise.
  const showStatus = capActive && state !== "FULL";
  const stateLabel = state === "DEGRADED" ? "Cap reached" : "Approaching cap";
  const symbol = currencySymbol(wallet.currency);

  return (
    <>
      <MeterBar
        state={capActive ? state : "FULL"}
        pct={pct}
        figure={`${symbol}${spent.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        capSuffix={
          capActive ? `/ ${formatMoneyMajor(cap, wallet.currency)} cap` : "no cap"
        }
        statusLabel={showStatus ? stateLabel : null}
        showBar={capActive}
        meta={
          <span>
            {wallet.billableUsed.toLocaleString()} PDFs ·{" "}
            {formatPeriodDate(wallet.billingPeriodStart)} →{" "}
            {formatPeriodDate(wallet.billingPeriodEnd)}
          </span>
        }
      />
      <p className="portal-billing__meter-foot">
        Estimated charges so far this period. The Stripe invoice is
        authoritative.
      </p>
    </>
  );
}
