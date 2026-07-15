import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { formatPeriodDate, MeterBar, meterState } from "@app/billing";
import type { Wallet } from "@portal/api/billing";

/**
 * Prepaid-bundle capacity for the subscribed Processor dashboard, and the entry
 * point for buying it. Two faces, driven by whether the team holds a bundle:
 *
 *   - No bundle → a slim "Get 12 months for the price of 10" offer nudge with a
 *     "Review offer" CTA (the demo's commit-nudge card), shown only when a buyer
 *     ({@code onBuy}, leader) is present.
 *   - Bundle held → the capacity meter (fills as the pool is drawn down, so it
 *     warns as capacity runs low) plus a "Top up" action for the leader.
 *
 * Prepaid is consumed before metered billing and sits outside the spend limit, so
 * it reads as its own dimension. Buying/topping up opens {@code BundleCheckoutModal}
 * via {@code onBuy}; members (no {@code onBuy}) get the display-only meter.
 */
export function PrepaidCapacityCard({
  wallet,
  onBuy,
}: {
  wallet: Wallet;
  /** Leader-only: opens the purchase/top-up modal. Omit for members. */
  onBuy?: () => void;
}) {
  const { t } = useTranslation();

  // No bundle yet — show the buy nudge (leader only), else nothing.
  if (wallet.prepaidUnitsTotal <= 0) {
    if (!onBuy) return null;
    return (
      <Card padding="loose" className="portal-billing__prepaid-offer">
        <div>
          <div className="portal-billing__section-title">
            {t(
              "portal.billing.prepaid.offer.title",
              "Get 12 months for the price of 10",
            )}
          </div>
          <p className="portal-billing__prepaid-offer-sub">
            {t(
              "portal.billing.prepaid.offer.subtitle",
              "Prepay a year of PDF processing and get two months free — used before metered billing, outside your spend limit.",
            )}
          </p>
        </div>
        <Button variant="secondary" onClick={onBuy}>
          {t("portal.billing.prepaid.offer.cta", "Review offer")}
        </Button>
      </Card>
    );
  }

  const remaining = wallet.prepaidUnitsRemaining;
  const total = wallet.prepaidUnitsTotal;
  const used = Math.max(0, total - remaining);
  const { state, pct } = meterState(used, total);
  const stateLabel =
    state === "DEGRADED"
      ? t("portal.billing.prepaid.state.exhausted", "Used up")
      : state === "WARNED"
        ? t("portal.billing.prepaid.state.low", "Running low")
        : t("portal.billing.prepaid.state.healthy", "Plenty left");

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">
        {t("portal.billing.prepaid.eyebrow", "Prepaid capacity")}
      </span>
      <MeterBar
        state={state}
        pct={pct}
        figure={remaining.toLocaleString()}
        capSuffix={t(
          "portal.billing.prepaid.capSuffix",
          "of {{total}} prepaid PDFs",
          {
            total: total.toLocaleString(),
          },
        )}
        statusLabel={stateLabel}
        meta={
          wallet.prepaidExpiresAt ? (
            <span>
              {t("portal.billing.prepaid.expires", "Expires {{date}}", {
                date: formatPeriodDate(wallet.prepaidExpiresAt, { year: true }),
              })}
            </span>
          ) : undefined
        }
      />
      <div className="portal-billing__prepaid-foot">
        <p className="portal-billing__section-sub">
          {t(
            "portal.billing.prepaid.note",
            "Used before metered billing and outside your spend limit.",
          )}
        </p>
        {onBuy && (
          <Button variant="secondary" size="sm" onClick={onBuy}>
            {t("portal.billing.prepaid.topUp", "Top up")}
          </Button>
        )}
      </div>
    </Card>
  );
}
