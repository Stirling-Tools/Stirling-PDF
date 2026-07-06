import { useTranslation } from "react-i18next";
import { Card } from "@app/ui";
import { formatMinor } from "@app/billing";
import type { Wallet } from "@portal/api/billing";
import { EnterpriseUpsell } from "@portal/components/billing/EnterpriseUpsell";

/**
 * Actual metered spend this period, with the Enterprise upsell tacked onto the
 * foot (matching marketing — not a separate full-width row). Flex column so the
 * upsell pins to the bottom and the card matches the spend-limit card's height.
 */
export function SpendThisMonthCard({ wallet }: { wallet: Wallet }) {
  const { t } = useTranslation();
  const rateLabel =
    wallet.pricePerDocMinor != null && wallet.pricePerDocMinor > 0
      ? formatMinor(wallet.pricePerDocMinor, wallet.currency)
      : null;

  return (
    <Card padding="loose" className="portal-billing__spend-this-month">
      <span className="portal-billing__eyebrow">
        {t("portal.billing.spendThisMonth.eyebrow", "Spend this month")}
      </span>
      <div className="portal-billing__bignum-row">
        <span className="portal-billing__bignum">
          {formatMinor(wallet.estimatedBillMinor ?? 0, wallet.currency)}
        </span>
      </div>
      <p className="portal-billing__section-sub">
        {rateLabel
          ? t(
              "portal.billing.spendThisMonth.processedWithRate",
              "{{formattedCount}} PDFs processed, at {{rate}} each.",
              {
                count: wallet.billableUsed,
                formattedCount: wallet.billableUsed.toLocaleString(),
                rate: rateLabel,
              },
            )
          : t(
              "portal.billing.spendThisMonth.processed",
              "{{formattedCount}} PDFs processed.",
              {
                count: wallet.billableUsed,
                formattedCount: wallet.billableUsed.toLocaleString(),
              },
            )}
      </p>

      <div className="portal-billing__spend-foot">
        <EnterpriseUpsell bare />
      </div>
    </Card>
  );
}
