import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@app/ui";
import { formatMinor, MeterBar, remainingMeter } from "@app/billing";
import type { Wallet } from "@processor/api/billing";
import type { LocalUsage } from "@processor/api/link";

interface Props {
  /** A linked-free wallet. */
  wallet: Wallet;
  /** Instance-local usage not yet synced to SaaS; folded into "used" so the trial meter reflects work since the last sync. */
  unsynced?: LocalUsage | null;
  /** Optional top-right action (e.g. "Switch on the Processor"). */
  action?: ReactNode;
}

/**
 * The free Processor-trial meter — "X of N free PDFs left" against the one-time
 * grant, with what has been used alongside as the status badge. The bar shows what
 * is left, so it drains towards empty as the grant is spent.
 * Uses the shared {@link MeterBar} (same `paygf-meter` structure as the
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
  const { state, pct } = remainingMeter(remaining, wallet.freeAllowance);
  const rate =
    wallet.pricePerDocMinor != null && wallet.pricePerDocMinor > 0
      ? wallet.pricePerDocMinor
      : null;
  const title =
    rate != null
      ? t(
          "processor.billing.walletMeter.titleWithRate",
          "Process {{allowance}} PDFs free, then {{rate}}/PDF",
          {
            count: wallet.freeAllowance,
            allowance: wallet.freeAllowance.toLocaleString(),
            rate: formatMinor(rate, wallet.currency),
          },
        )
      : t(
          "processor.billing.walletMeter.title",
          "Process {{allowance}} PDFs free",
          {
            count: wallet.freeAllowance,
            allowance: wallet.freeAllowance.toLocaleString(),
          },
        );

  return (
    <Card padding="loose">
      <div className="processor-billing__subscription-head">
        <div>
          <span className="processor-billing__eyebrow">
            {t("processor.billing.walletMeter.eyebrow", "Processor trial")}
          </span>
          <h2 className="processor-billing__meter-title">{title}</h2>
          <p className="processor-billing__section-sub">
            {t(
              "processor.billing.walletMeter.sub",
              "Use the PDF Editor for free. Pay to process PDFs automatically.",
            )}
          </p>
        </div>
        {action}
      </div>
      <div className="processor-billing__trial-meter">
        <MeterBar
          state={state}
          pct={pct}
          barLabel={t(
            "processor.billing.walletMeter.barAria",
            "Free PDFs remaining",
          )}
          figure={remaining.toLocaleString()}
          capSuffix={t(
            "processor.billing.walletMeter.capSuffix",
            "of {{allowance}} free PDFs left",
            {
              count: wallet.freeAllowance,
              allowance: wallet.freeAllowance.toLocaleString(),
            },
          )}
          statusLabel={t(
            "processor.billing.walletMeter.statusLabel",
            "{{used}} used",
            { count: used, used: used.toLocaleString() },
          )}
        />
      </div>
    </Card>
  );
}
