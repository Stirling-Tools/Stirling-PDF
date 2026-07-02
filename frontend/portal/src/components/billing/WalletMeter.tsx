import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@shared/components";
import { formatMinor, MeterBar, meterState } from "@shared/billing";
import type { Wallet } from "@portal/api/billing";
import type { LocalUsage } from "@portal/api/link";

interface Props {
  /** A linked-free wallet. */
  wallet: Wallet;
  /** Instance-local usage not yet synced to SaaS; folded into "used" so the trial meter reflects work since the last sync. */
  unsynced?: LocalUsage | null;
  /** Optional top-right action (e.g. "Switch on the Processor"). */
  action?: ReactNode;
}

/**
 * The free Processor-trial meter — "X / N free PDFs used" against the one-time
 * grant. Uses the shared {@link MeterBar} (same `paygf-meter` structure as the
 * cloud plan page). The subscribed spend-vs-cap meter is a separate surface
 * ({@code SpendLimitCard}); this card is only the free face.
 *
 * <p>Locally-accrued usage SaaS hasn't billed yet ({@code unsynced}) is folded
 * into the used figure + remaining count so the trial depletes in step with the
 * gate — which now also blocks against the pending local delta — instead of only
 * moving after a daily sync.
 */
export function WalletMeter({ wallet, unsynced, action }: Props) {
  const { t } = useTranslation();
  const pending = unsynced?.totalUnsyncedUnits ?? 0;
  const used = wallet.billableUsed + pending;
  const remaining = Math.max(0, wallet.freeRemaining - pending);
  const { state, pct } = meterState(used, wallet.freeAllowance);
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
          figure={used.toLocaleString()}
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
              count: remaining,
              remaining: remaining.toLocaleString(),
            },
          )}
        />
      </div>
    </Card>
  );
}
