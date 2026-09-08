import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { formatMinor, formatMoneyMajor, meterState } from "@app/billing/format";
import { remainingMeter } from "@app/billing/format";
import { MeterBar } from "@app/billing/MeterBar";
import type { Wallet } from "@app/billing/types";

/**
 * The Processor holding: metered document automation beyond the free grant.
 *
 * <p>The counterpart to {@code TeamPlanCard}, and deliberately shaped the same way: it reads
 * {@code wallet.processor.active} rather than {@code wallet.status}, so a team that holds Team but
 * not the Processor renders correctly instead of being described by an axis that only covers one of
 * the two products.
 *
 * <p>Two faces:
 *
 * <ul>
 *   <li>not active: the free grant, draining, plus what the Processor would add
 *   <li>active: spend for the period, metered against the spend limit when one is set
 * </ul>
 *
 * <p>Money arrives in two scales and they are not mixed: {@code estimatedBillMinor} is minor units
 * and {@code capUsd} is major, so the comparison converts once, here, rather than leaving a factor
 * of a hundred for a caller to get wrong. An unknown rate yields a null estimate, which is reported
 * as unknown rather than as zero: zero spend and unknown spend are different facts.
 */
export function ProcessorPlanCard({
  wallet,
  pendingUnits = 0,
  onActivate,
}: {
  wallet: Wallet;
  /**
   * Units a linked instance has accrued that the cloud has not billed yet. Units-only, so it folds
   * into the meter figure but never into a document count.
   */
  pendingUnits?: number;
  /** Leader-only: switches the Processor on. Omit for members. */
  onActivate?: () => void;
}) {
  const { t } = useTranslation();
  const eyebrow = t("portal.billing.processor.eyebrow", "Processor");

  // Not held: the free grant is the whole story, and it drains rather than fills.
  if (!wallet.processor.active) {
    // Units a linked instance has accrued draw down the same grant, so they are subtracted here
    // rather than reported beside it. Leaving them out would show headroom that is already spent.
    const remaining = Math.max(0, wallet.freeRemaining - pendingUnits);
    const { state, pct } = remainingMeter(remaining, wallet.freeAllowance);
    return (
      <Card padding="loose">
        <span className="portal-billing__eyebrow">{eyebrow}</span>
        <MeterBar
          state={state}
          pct={pct}
          barLabel={t(
            "portal.billing.processor.freeBarLabel",
            "Free credits remaining",
          )}
          figure={remaining.toLocaleString()}
          capSuffix={t(
            "portal.billing.processor.freeCapSuffix",
            "of {{allowance}} free credits this period",
            { allowance: wallet.freeAllowance.toLocaleString() },
          )}
          statusLabel={
            remaining === 0
              ? t("portal.billing.processor.state.exhausted", "Used up")
              : t("portal.billing.processor.state.free", "Free tier")
          }
        />
        <div className="portal-billing__prepaid-foot">
          <p className="portal-billing__section-sub">
            {t(
              "portal.billing.processor.offer",
              "The Processor bills automation, API and agent work by what it processes, after the free credits run out. Manual edits in the editor stay free.",
            )}
            {pendingUnits > 0
              ? ` ${t(
                  "portal.billing.processor.pending",
                  "{{units}} meter units are still pending sync from linked instances.",
                  { units: pendingUnits.toLocaleString() },
                )}`
              : ""}
          </p>
          {onActivate && (
            <Button variant="secondary" size="sm" onClick={onActivate}>
              {t("portal.billing.processor.activate", "Switch on")}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const spentMinor = wallet.estimatedBillMinor;
  const capped = !wallet.noCap && wallet.capUsd != null;
  // One conversion, in one place: the estimate is minor units and the cap is major.
  const spentMajor = spentMinor != null ? spentMinor / 100 : null;
  const { state, pct } =
    capped && spentMajor != null
      ? meterState(spentMajor, wallet.capUsd as number)
      : { state: "FULL" as const, pct: 0 };

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">{eyebrow}</span>
      <MeterBar
        state={state}
        pct={pct}
        showBar={capped && spentMajor != null}
        barLabel={t("portal.billing.processor.spendBarLabel", "Spend limit")}
        figure={
          spentMinor != null
            ? formatMinor(spentMinor, wallet.currency)
            : t("portal.billing.processor.unknownSpend", "Unknown")
        }
        capSuffix={
          capped
            ? t("portal.billing.processor.capSuffix", "of a {{cap}} limit", {
                cap: formatMoneyMajor(wallet.capUsd as number, wallet.currency),
              })
            : t("portal.billing.processor.noCapSuffix", "this period, no limit")
        }
        statusLabel={t("portal.billing.processor.state.active", "Active")}
      />
      <div className="portal-billing__prepaid-foot">
        <p className="portal-billing__section-sub">
          {t(
            "portal.billing.processor.periodSummary",
            "{{docs}} PDFs processed this period.",
            { docs: wallet.docsProcessedThisPeriod.toLocaleString() },
          )}
          {pendingUnits > 0
            ? ` ${t(
                "portal.billing.processor.pending",
                "{{units}} meter units are still pending sync from linked instances.",
                { units: pendingUnits.toLocaleString() },
              )}`
            : ""}
        </p>
      </div>
    </Card>
  );
}
