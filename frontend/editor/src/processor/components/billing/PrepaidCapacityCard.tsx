import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { formatPeriodDate, MeterBar, remainingMeter } from "@app/billing";
import type { Wallet } from "@processor/api/billing";

/**
 * Prepaid-bundle capacity for the subscribed Processor dashboard, and the entry
 * point for buying it. Two faces, driven by whether the team holds a bundle:
 *
 *   - No bundle → a slim "Get 12 months for the price of 10" offer nudge with a
 *     "Review offer" CTA (the demo's commit-nudge card), shown only when a buyer
 *     ({@code onBuy}, leader) is present.
 *   - Bundle held → the capacity meter (drains towards empty as the pool is drawn
 *     down, so it warns as capacity runs low) plus a "Top up" action for the leader.
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
      <Card padding="loose" className="processor-billing__prepaid-offer">
        <div>
          <div className="processor-billing__section-title">
            {t(
              "processor.billing.prepaid.offer.title",
              "Get 12 months for the price of 10",
            )}
          </div>
          <p className="processor-billing__prepaid-offer-sub">
            {t(
              "processor.billing.prepaid.offer.subtitle",
              "Prepay a year of PDF processing and get two months free — used before metered billing, outside your spend limit.",
            )}
          </p>
        </div>
        <Button variant="secondary" onClick={onBuy}>
          {t("processor.billing.prepaid.offer.cta", "Review offer")}
        </Button>
      </Card>
    );
  }

  const remaining = wallet.prepaidUnitsRemaining;
  const total = wallet.prepaidUnitsTotal;
  const { state, pct } = remainingMeter(remaining, total);
  const stateLabel =
    state === "DEGRADED"
      ? t("processor.billing.prepaid.state.exhausted", "Used up")
      : state === "WARNED"
        ? t("processor.billing.prepaid.state.low", "Running low")
        : t("processor.billing.prepaid.state.healthy", "Plenty left");

  return (
    <Card padding="loose">
      <span className="processor-billing__eyebrow">
        {t("processor.billing.prepaid.eyebrow", "Prepaid capacity")}
      </span>
      <MeterBar
        state={state}
        pct={pct}
        barLabel={t("processor.billing.prepaid.eyebrow", "Prepaid capacity")}
        figure={remaining.toLocaleString()}
        capSuffix={t(
          "processor.billing.prepaid.capSuffix",
          "of {{total}} prepaid credits",
          {
            total: total.toLocaleString(),
          },
        )}
        statusLabel={stateLabel}
        meta={
          wallet.prepaidExpiresAt ? (
            <span>
              {t("processor.billing.prepaid.expires", "Expires {{date}}", {
                date: formatPeriodDate(wallet.prepaidExpiresAt, { year: true }),
              })}
            </span>
          ) : undefined
        }
      />
      <div className="processor-billing__prepaid-foot">
        <p className="processor-billing__section-sub">
          {t(
            "processor.billing.prepaid.note",
            "Used before metered billing and outside your spend limit.",
          )}
        </p>
        {onBuy && (
          <Button variant="secondary" size="sm" onClick={onBuy}>
            {t("processor.billing.prepaid.topUp", "Top up")}
          </Button>
        )}
      </div>
    </Card>
  );
}
