import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMinor, formatMoneyMajor } from "@app/billing/format";
import { MeterRow } from "@app/billing/MeterRow";
import type { Wallet } from "@app/billing/types";

/**
 * The Processor product, as a row: the free grant draining towards activation while off, spend
 * against the limit while on.
 *
 * <p>Money arrives in two scales. The estimate is minor units and the limit is major, so the
 * comparison converts once here rather than leaving a factor of a hundred to a caller. An unknown
 * rate reports as unknown, never as zero.
 */
export function ProcessorPlanRow({
  wallet,
  pendingUnits = 0,
  onActivate,
  onGovern,
  governLabel,
}: {
  wallet: Wallet;
  /**
   * Units accrued locally that the cloud has not billed yet. Subtracted rather than shown beside
   * the total, because the entitlement gate blocks against this same pending delta: reporting more
   * remaining than the gate will honour is what makes a wall arrive early.
   */
  pendingUnits?: number;
  /** Leader-only, while off: the activation door. Omit for members. */
  onActivate?: () => void;
  /** Leader-only, while on: the spend-limit door. Omit for members. */
  onGovern?: () => void;
  /** Overrides the governing door's label, e.g. "Top up" for a prepaid team. */
  governLabel?: ReactNode;
}) {
  const { t } = useTranslation();
  const name = t("portal.billing.processor.rowName", "Processor");

  if (!wallet.processor.active) {
    const used = Math.min(
      wallet.freeAllowance,
      Math.max(0, wallet.freeAllowance - wallet.freeRemaining + pendingUnits),
    );
    const pct =
      wallet.freeAllowance > 0 ? (used / wallet.freeAllowance) * 100 : 0;
    const rate = wallet.pricePerDocMinor;
    const mid =
      rate != null
        ? t(
            "portal.billing.processor.midFree",
            "{{rate}} per credit · {{allowance}} free every month",
            {
              rate: formatMinor(rate, wallet.currency),
              allowance: wallet.freeAllowance.toLocaleString(),
            },
          )
        : t(
            "portal.billing.processor.midFreeNoRate",
            "{{allowance}} free every month",
            { allowance: wallet.freeAllowance.toLocaleString() },
          );

    return (
      <MeterRow
        name={name}
        mid={mid}
        pct={pct}
        tone="free"
        fact={t(
          "portal.billing.processor.factFree",
          "{{used}} of {{allowance}} used",
          {
            used: used.toLocaleString(),
            allowance: wallet.freeAllowance.toLocaleString(),
          },
        )}
        door={
          onActivate
            ? t("portal.billing.processor.activate", "Switch on the Processor")
            : undefined
        }
        onDoor={onActivate}
      />
    );
  }

  const spentMinor = wallet.estimatedBillMinor;
  const capped = !wallet.noCap && wallet.capUsd != null;
  // One conversion, in one place: the estimate is minor units, the limit is major.
  const spentMajor = spentMinor != null ? spentMinor / 100 : null;
  const pct =
    capped && spentMajor != null
      ? (spentMajor / (wallet.capUsd as number)) * 100
      : 0;

  const mid =
    spentMinor != null
      ? t(
          "portal.billing.processor.midMetered",
          "{{spend}} metered this cycle",
          {
            spend: formatMinor(spentMinor, wallet.currency),
          },
        )
      : t("portal.billing.processor.midMeteredUnknown", "Metered this cycle");

  const fact = capped
    ? t("portal.billing.processor.factCapped", "{{pct}}% of {{cap}}", {
        pct: Math.round(pct).toLocaleString(),
        cap: formatMoneyMajor(wallet.capUsd as number, wallet.currency),
      })
    : t("portal.billing.processor.factNoCap", "no limit");

  const door =
    governLabel ??
    (onGovern
      ? t("portal.billing.processor.raiseLimit", "Raise limit")
      : undefined);

  return (
    <MeterRow
      name={name}
      mid={mid}
      pct={pct}
      tone={capped && pct >= 90 ? "warn" : "paid"}
      showTrack={capped}
      fact={fact}
      door={onGovern ? door : undefined}
      onDoor={onGovern}
      midTitle={
        capped
          ? t(
              "portal.billing.processor.capTooltip",
              "Pauses PDF processing at your spend limit.",
            )
          : undefined
      }
    />
  );
}
