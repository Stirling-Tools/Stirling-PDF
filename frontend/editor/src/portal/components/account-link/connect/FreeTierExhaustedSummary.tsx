import { useTranslation } from "react-i18next";
import { formatPeriodDate, MeterBar, remainingMeter } from "@app/billing";
import { useFreeTierBalance } from "@portal/hooks/useFreeTierBalance";

/** A local allowance summary; unavailable figures never become invented zeroes or reset dates. */
export function FreeTierExhaustedSummary() {
  const { t } = useTranslation();
  const { data: balance } = useFreeTierBalance();
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
