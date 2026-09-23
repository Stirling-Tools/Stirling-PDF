import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  formatMinor,
  formatMoneyMajor,
  formatPeriodDate,
  remainingMeter,
} from "@app/billing/format";
import { MeterRow } from "@app/billing/MeterRow";
import { estimatedBillWithPending } from "@app/billing/pendingUsage";
import type { Wallet } from "@app/billing/types";

/** One tranche of the row's breakdown: a labelled figure over its own small bar. */
function Tranche({
  label,
  value,
  pct,
  note,
  showBar = true,
}: {
  label: string;
  value: ReactNode;
  /** Null draws the track empty and reports no value — an unknown, not a zero. */
  pct: number | null;
  note?: ReactNode;
  showBar?: boolean;
}) {
  const width = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="billing-breakdown__row">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {showBar && (
        <span
          className="billing-breakdown__bar"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct == null ? undefined : Math.round(width)}
        >
          <span
            className="billing-breakdown__fill"
            style={{ width: `${width}%` }}
          />
        </span>
      )}
      {note && <small>{note}</small>}
    </div>
  );
}

/**
 * The Processor product, as a row: the free grant draining towards activation while off, a live
 * prepaid pool while one is held, and spend against the limit once the meter is what is left.
 *
 * <p>All three are tranches of one product, so they share one row rather than stacking cards.
 * The headline is whichever governs the team right now and the hover breakdown carries the rest.
 * A live prepaid pool leads: it is what the team draws on, and the metered figure cannot move
 * until it empties.
 *
 * <p>Money arrives in two scales. The estimate is minor units and the limit is major, so the
 * comparison converts once here rather than leaving a factor of a hundred to a caller. An unknown
 * rate reports as unknown, never as zero.
 */
export function ProcessorPlanRow({
  wallet,
  included = false,
  pendingUnits = 0,
  onActivate,
  activateLabel,
  onGovern,
  governLabel,
}: {
  wallet: Wallet | null;
  /** A validated local Enterprise licence includes processing independently of the wallet. */
  included?: boolean;
  /**
   * Units accrued locally that the cloud has not billed yet. Subtracted rather than shown beside
   * the total, because the entitlement gate blocks against this same pending delta: reporting more
   * remaining than the gate will honour is what makes a wall arrive early.
   */
  pendingUnits?: number;
  /** Leader-only, while off: the activation door. Omit for members. */
  onActivate?: () => void;
  /** Overrides activation with the host's quote or invoice resume label. */
  activateLabel?: ReactNode;
  /** Leader-only, while on: the spend-limit door. Omit for members. */
  onGovern?: () => void;
  /** Overrides the governing door's label, e.g. "Top up" for a prepaid team. */
  governLabel?: ReactNode;
}) {
  const { t } = useTranslation();
  const name = t("portal.billing.processor.rowName", "Processor");
  if (included)
    return (
      <MeterRow
        name={name}
        mid={t("portal.billing.processor.included", "Included in your license")}
        fact=""
        tone="paid"
        showTrack={false}
      />
    );
  if (!wallet) return null;
  const rate = wallet.pricePerDocMinor;
  const active = wallet.processor.active;

  // One door per row, and both of them already reach a purchase: the activation fork sells
  // prepay, the spend-limit dialog sells credits. Prepaid therefore adds no third door.
  const door = active
    ? onGovern
      ? (governLabel ?? t("portal.billing.processor.raiseLimit", "Raise limit"))
      : undefined
    : onActivate
      ? (activateLabel ??
        t("portal.billing.processor.activate", "Switch on the Processor"))
      : undefined;
  const onDoor = active ? onGovern : onActivate;

  // Drawdown order mirrors pendingMeteredUnits: the free grant, then the prepaid pool, then the
  // meter. Unsynced units consume them in that same order, so no tranche reports headroom the
  // entitlement gate will refuse.
  const freeLeft = Math.min(
    wallet.freeAllowance,
    Math.max(0, wallet.freeRemaining - pendingUnits),
  );
  const prepaidTotal = wallet.prepaidUnitsTotal;
  const prepaidLeft = Math.max(
    0,
    wallet.prepaidUnitsRemaining -
      Math.max(0, pendingUnits - wallet.freeRemaining),
  );
  const heldPrepaid = prepaidTotal > 0;
  const prepaidMeter = heldPrepaid
    ? remainingMeter(prepaidLeft, prepaidTotal)
    : null;

  const spentMinor = active
    ? estimatedBillWithPending(wallet, pendingUnits)
    : null;
  const capped = active && !wallet.noCap && wallet.capUsd != null;
  // One conversion, in one place: the estimate is minor units, the limit is major.
  const spentMajor = spentMinor != null ? spentMinor / 100 : null;
  const spendPct =
    capped && spentMajor != null
      ? wallet.capUsd === 0
        ? 100
        : (spentMajor / (wallet.capUsd as number)) * 100
      : 0;

  const remainingOf = (remaining: number, total: number) =>
    t("portal.billing.processor.remainingOf", "{{remaining}} of {{total}}", {
      remaining: remaining.toLocaleString(),
      total: total.toLocaleString(),
    });

  const tranches: ReactNode[] = [];
  if (wallet.freeAllowance > 0)
    tranches.push(
      <Tranche
        key="free"
        label={t(
          "portal.billing.processor.freeRemaining",
          "Free credits remaining",
        )}
        value={remainingOf(freeLeft, wallet.freeAllowance)}
        pct={(freeLeft / wallet.freeAllowance) * 100}
      />,
    );
  if (heldPrepaid)
    tranches.push(
      <Tranche
        key="prepaid"
        label={t(
          "portal.billing.processor.prepaidRemaining",
          "Prepaid credits remaining",
        )}
        value={remainingOf(prepaidLeft, prepaidTotal)}
        pct={prepaidMeter?.pct ?? 0}
        note={
          prepaidLeft === 0
            ? t(
                "portal.billing.processor.prepaidExhausted",
                "Used up, metered billing has resumed",
              )
            : wallet.prepaidExpiresAt
              ? t(
                  "portal.billing.processor.prepaidExpires",
                  "Expires {{date}}",
                  {
                    date: formatPeriodDate(wallet.prepaidExpiresAt, {
                      year: true,
                    }),
                  },
                )
              : undefined
        }
      />,
    );
  if (active)
    tranches.push(
      <Tranche
        key="paid"
        label={t("portal.billing.processor.paidUsed", "Paid metered usage")}
        value={
          <>
            {spentMinor == null
              ? "—"
              : formatMinor(spentMinor, wallet.currency)}
            {capped
              ? ` / ${formatMoneyMajor(wallet.capUsd as number, wallet.currency)}`
              : ""}
          </>
        }
        pct={spentMinor == null ? null : spendPct}
        showBar={capped}
        note={
          capped
            ? undefined
            : t("portal.billing.processor.noSpendLimit", "No spend limit")
        }
      />,
    );
  // A lone tranche is what the headline already says, and a tooltip would only repeat it.
  const details =
    tranches.length > 1 ? (
      <div className="billing-breakdown">{tranches}</div>
    ) : undefined;

  if (heldPrepaid && prepaidLeft > 0) {
    const summary = t(
      "portal.billing.processor.midPrepaid",
      "Prepaid credits, drawn before metered billing",
    );
    return (
      <MeterRow
        name={name}
        mid={
          wallet.prepaidExpiresAt
            ? t(
                "portal.billing.processor.midPrepaidExpiry",
                "{{summary}} · Expires {{date}}",
                {
                  summary,
                  date: formatPeriodDate(wallet.prepaidExpiresAt, {
                    year: true,
                  }),
                },
              )
            : summary
        }
        midTitle={t(
          "portal.billing.processor.prepaidTooltip",
          "Drawn before metered billing, and outside your spend limit.",
        )}
        details={details}
        pct={prepaidMeter?.pct ?? 0}
        tone={prepaidMeter?.state === "FULL" ? "paid" : "warn"}
        fact={t("portal.billing.processor.factPrepaid", "{{remaining}} left", {
          remaining: prepaidLeft.toLocaleString(),
        })}
        door={door}
        onDoor={onDoor}
      />
    );
  }

  if (!active) {
    if (wallet.freeAllowance <= 0)
      return (
        <MeterRow
          name={name}
          mid=""
          fact=""
          showTrack={false}
          door={door}
          onDoor={onDoor}
        />
      );
    const used = wallet.freeAllowance - freeLeft;
    const freeMid =
      rate != null
        ? t(
            "portal.billing.processor.midIncluded",
            "{{rate}} per credit · {{allowance}} included every month",
            {
              rate: formatMinor(rate, wallet.currency),
              allowance: wallet.freeAllowance.toLocaleString(),
            },
          )
        : t(
            "portal.billing.processor.midIncludedNoRate",
            "{{allowance}} included every month",
            {
              allowance: wallet.freeAllowance.toLocaleString(),
            },
          );
    return (
      <MeterRow
        name={name}
        mid={
          wallet.includedPeriodEnd
            ? t(
                "portal.billing.processor.includedRenewal",
                "{{summary}} · Renews {{date}}",
                {
                  summary: freeMid,
                  date: formatPeriodDate(wallet.includedPeriodEnd),
                },
              )
            : freeMid
        }
        details={details}
        pct={(used / wallet.freeAllowance) * 100}
        tone="free"
        fact={t(
          "portal.billing.processor.factFree",
          "{{used}} of {{allowance}} used",
          {
            used: used.toLocaleString(),
            allowance: wallet.freeAllowance.toLocaleString(),
          },
        )}
        door={door}
        onDoor={onDoor}
      />
    );
  }

  const mid =
    spentMinor != null
      ? capped
        ? t(
            "portal.billing.processor.spendAgainstLimit",
            "{{spend}} of {{cap}} metered this cycle",
            {
              spend: formatMinor(spentMinor, wallet.currency),
              cap: formatMoneyMajor(wallet.capUsd as number, wallet.currency),
            },
          )
        : t(
            "portal.billing.processor.midMetered",
            "{{spend}} metered this cycle",
            {
              spend: formatMinor(spentMinor, wallet.currency),
            },
          )
      : t("portal.billing.processor.midMeteredUnknown", "Metered this cycle");

  const fact = capped
    ? spentMinor == null
      ? "—"
      : t("portal.billing.processor.percentUsed", "{{pct}}%", {
          pct: Math.round(spendPct).toLocaleString(),
        })
    : t("portal.billing.processor.factNoCap", "no limit");

  return (
    <MeterRow
      name={name}
      mid={mid}
      details={details}
      pct={spendPct}
      tone={capped && spendPct >= 90 ? "warn" : "paid"}
      showTrack={capped}
      fact={fact}
      door={door}
      onDoor={onDoor}
      midTitle={
        capped
          ? t(
              "portal.billing.processor.meteredCapTooltip",
              "Pauses metered processing at your spend limit.",
            )
          : undefined
      }
    />
  );
}
