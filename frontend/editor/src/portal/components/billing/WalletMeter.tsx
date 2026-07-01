import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@shared/components";
import { formatMinor, MeterBar, meterState } from "@shared/billing";
import type { Wallet } from "@portal/api/billing";

interface Props {
  /** A linked-free wallet. */
  wallet: Wallet;
  /** Optional top-right action (e.g. "Switch on the Processor"). */
  action?: ReactNode;
}

/**
 * The free Processor-trial meter — "X / N free PDFs used" against the one-time
 * grant. Uses the shared {@link MeterBar} (same `paygf-meter` structure as the
 * cloud plan page). The subscribed spend-vs-cap meter is a separate surface
 * ({@code SpendLimitCard}); this card is only the free face.
 */
export function WalletMeter({ wallet, action }: Props) {
  const { t } = useTranslation();
  const { state, pct } = meterState(wallet.billableUsed, wallet.freeAllowance);
  const rate =
    wallet.pricePerDocMinor != null && wallet.pricePerDocMinor > 0
      ? wallet.pricePerDocMinor
      : null;
  const title =
    rate != null
      ? t(
          "billing.walletMeter.titleWithRate",
          "Process {{allowance}} PDFs free, then {{rate}}/PDF",
          {
            count: wallet.freeAllowance,
            allowance: wallet.freeAllowance.toLocaleString(),
            rate: formatMinor(rate, wallet.currency),
          },
        )
      : t("billing.walletMeter.title", "Process {{allowance}} PDFs free", {
          count: wallet.freeAllowance,
          allowance: wallet.freeAllowance.toLocaleString(),
        });

  return (
    <Card padding="loose">
      <div className="portal-billing__subscription-head">
        <div>
          <span className="portal-billing__eyebrow">
            {t("billing.walletMeter.eyebrow", "Processor trial")}
          </span>
          <h2 className="portal-billing__meter-title">{title}</h2>
          <p className="portal-billing__section-sub">
            {t(
              "billing.walletMeter.sub",
              "Use the PDF Editor for free. Pay to process PDFs automatically.",
            )}
          </p>
        </div>
        {action}
      </div>
      <div className="portal-billing__trial-meter">
        <MeterBar
          state={state}
          pct={pct}
          figure={wallet.billableUsed.toLocaleString()}
          capSuffix={t(
            "billing.walletMeter.capSuffix",
            "of {{allowance}} free PDFs used",
            {
              count: wallet.freeAllowance,
              allowance: wallet.freeAllowance.toLocaleString(),
            },
          )}
          statusLabel={t(
            "billing.walletMeter.statusLabel",
            "{{remaining}} left",
            {
              count: wallet.freeRemaining,
              remaining: wallet.freeRemaining.toLocaleString(),
            },
          )}
        />
      </div>
    </Card>
  );
}
