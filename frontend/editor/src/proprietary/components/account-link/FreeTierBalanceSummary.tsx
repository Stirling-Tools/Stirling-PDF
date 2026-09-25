import { useTranslation } from "react-i18next";
import { formatPeriodDate, MeterBar, remainingMeter } from "@app/billing";

/** Local server allowance; figures are never inferred from an exhausted response. */
export interface FreeTierBalance {
  grantUnits: number;
  usedUnits: number;
  remainingUnits: number;
  periodStart: string;
  periodEnd: string;
}
/** Renders only authoritative figures, including outside the Processor provider tree. */
export function FreeTierBalanceSummary({
  balance,
}: {
  balance?: FreeTierBalance;
}) {
  const { t } = useTranslation();
  if (!balance) return null;
  const { state, pct } = remainingMeter(
    balance.remainingUnits,
    balance.grantUnits,
  );
  const resets = formatPeriodDate(balance.periodEnd);
  return (
    <div className="portal-connect__meter">
      <MeterBar
        state={state}
        pct={pct}
        figure={balance.remainingUnits.toLocaleString()}
        barLabel={t("portal.usage.freeTier.barAria", "Free credits remaining")}
        capSuffix={t(
          "portal.usage.freeTier.capSuffix",
          "of {{allowance}} free credits left this month",
          {
            allowance: balance.grantUnits.toLocaleString(),
            count: balance.grantUnits,
          },
        )}
        meta={
          resets
            ? t("portal.usage.freeTier.resets", "Resets {{date}}", {
                date: resets,
              })
            : null
        }
      />
    </div>
  );
}
