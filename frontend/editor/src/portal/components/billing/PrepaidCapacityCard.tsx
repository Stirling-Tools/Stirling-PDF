import { useTranslation } from "react-i18next";
import { Card } from "@app/ui";
import { formatPeriodDate, MeterBar, meterState } from "@app/billing";
import type { Wallet } from "@portal/api/billing";

/**
 * Prepaid-bundle capacity for the subscribed dashboard. The bar fills as the pool
 * is drawn down (used = total − remaining), so it warns as capacity runs low.
 * Prepaid is consumed before metered billing and sits outside the spend limit, so
 * it reads as its own dimension. Self-hides when the team holds no bundle.
 *
 * Display-only: buying / topping up happens in the app (leader-only). The portal
 * mirrors the same wallet contract the editor Plan page renders.
 */
export function PrepaidCapacityCard({ wallet }: { wallet: Wallet }) {
  const { t } = useTranslation();
  if (wallet.prepaidUnitsTotal <= 0) return null;

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
      <p className="portal-billing__section-sub">
        {t(
          "portal.billing.prepaid.note",
          "Used before metered billing and outside your spend limit.",
        )}
      </p>
    </Card>
  );
}
