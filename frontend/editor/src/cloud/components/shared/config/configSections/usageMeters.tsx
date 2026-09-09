/**
 * Compact usage meters shared by the Plan section and the usage-limit warning
 * modals. Kept in their own module (rather than inside Payg/PaygFree) so the
 * modals can render a meter without pulling in the upgrade-checkout subtree
 * (UpgradeModal, useWallet, etc.). Only depends on i18n + the co-located CSS.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWallet, type Wallet } from "@app/hooks/useWallet";
import {
  currencySymbol,
  formatPeriodDate,
  MeterBar,
  meterState,
  remainingMeter,
} from "@app/billing";
import "@app/components/shared/config/configSections/Payg.css";
import "@app/components/shared/config/configSections/PaygFree.css";

export interface FreeSnapshot {
  /** Free documents used so far this period (grant − remaining). */
  billableUsed: number;
  /** The team's free grant size in documents, per billing period. */
  billableLimit: number;
}

/**
 * Derive the free-grant snapshot from a wallet. Null (not yet loaded) yields a
 * zeroed view over the default 500 grant, the brief first-paint placeholder.
 */
export function freeSnapshotFromWallet(wallet: Wallet | null): FreeSnapshot {
  if (!wallet) return { billableUsed: 0, billableLimit: 500 };
  return {
    billableUsed: Math.max(0, wallet.freeAllowance - wallet.freeRemaining),
    billableLimit: wallet.freeAllowance,
  };
}

/**
 * Read the free-grant snapshot from the live wallet. Falls back to a zeroed
 * view over the default grant until the wallet loads.
 */
export function useFreeSnapshot(): FreeSnapshot {
  const { wallet } = useWallet();
  return useMemo(() => freeSnapshotFromWallet(wallet), [wallet]);
}

export function FreeMeterPanel({ snap }: { snap: FreeSnapshot }) {
  const { t } = useTranslation();
  const remaining = Math.max(0, snap.billableLimit - snap.billableUsed);
  const { state, pct } = remainingMeter(remaining, snap.billableLimit);
  const stateLabel =
    state === "DEGRADED"
      ? t("payg.free.state.limitReached", "Limit reached")
      : state === "WARNED"
        ? t("payg.free.state.approachingLimit", "Approaching limit")
        : t("payg.free.state.plentyLeft", "Plenty left");

  return (
    <MeterBar
      state={state}
      pct={pct}
      barLabel={t("payg.free.hero.barAria", "Free PDFs remaining")}
      figure={remaining.toLocaleString()}
      capSuffix={t(
        "payg.free.hero.capSuffix",
        "of {{limit}} free PDFs left this month",
        { limit: snap.billableLimit.toLocaleString() },
      )}
      statusLabel={stateLabel}
      meta={
        <span>
          {t("payg.free.hero.metaCategories", "Automation · AI · API requests")}
        </span>
      }
    />
  );
}

export interface SpendCapSnapshot {
  /** Money spent so far this billing period, in major currency units. */
  spent: number;
  /** The configured monthly spend cap, in major currency units. */
  cap: number;
  /** ISO currency code of {@link spent}/{@link cap}; null falls back to "$". */
  currency: string | null;
}

/**
 * Derive the spend-vs-cap snapshot from a wallet. {@code estimatedBillMinor} is
 * this period's charges in minor units; {@code capUsd} is the cap in major
 * units. Null wallet (or no cap set) yields a zeroed view.
 */
export function spendCapSnapshotFromWallet(
  wallet: Wallet | null,
): SpendCapSnapshot {
  if (!wallet) return { spent: 0, cap: 0, currency: null };
  return {
    spent:
      wallet.estimatedBillMinor != null ? wallet.estimatedBillMinor / 100 : 0,
    cap: wallet.capUsd ?? 0,
    currency: wallet.currency,
  };
}

/**
 * Sibling of {@link FreeMeterPanel} for the money cap rather than the free
 * grant. Shares the same bar/status styling and the cap-state labels
 * ({@code payg.state.*}) used by the Plan hero, so it reads as the same meter.
 */
export function SpendCapMeterPanel({ snap }: { snap: SpendCapSnapshot }) {
  const { t } = useTranslation();
  const { state, pct } = meterState(snap.spent, snap.cap);
  const stateLabel =
    state === "DEGRADED"
      ? t("payg.state.degraded", "Cap reached")
      : state === "WARNED"
        ? t("payg.state.warned", "Approaching cap")
        : t("payg.state.full", "Healthy");
  const symbol = currencySymbol(snap.currency);

  return (
    <MeterBar
      state={state}
      pct={pct}
      barLabel={t("payg.spendCapMeter.barAria", "Spend against cap")}
      figure={`${symbol}${snap.spent.toLocaleString()}`}
      capSuffix={t("payg.spendCapMeter.capSuffix", "/ {{amount}} cap", {
        amount: `${symbol}${snap.cap.toLocaleString()}`,
      })}
      statusLabel={stateLabel}
      meta={
        <>
          <span>
            {t(
              "payg.spendCapMeter.metaCategories",
              "Automation · AI · API spend",
            )}
          </span>
          <span className="payg-hero__meta-dot">•</span>
          <span>
            {t("payg.spendCapMeter.resets", "Resets each billing period")}
          </span>
        </>
      }
    />
  );
}

export interface PrepaidSnapshot {
  /** Prepaid units still available across the team's in-term pools. */
  remaining: number;
  /** Total capacity of in-term pools — the "X of Y" denominator. */
  total: number;
  /** ISO date the soonest pool expires; null when no bundle. */
  expiresAt: string | null;
}

/**
 * Derive the prepaid-capacity snapshot from a wallet. Returns null when the team
 * holds no in-term bundle ({@code prepaidUnitsTotal === 0}) so callers can skip
 * the card entirely rather than render an empty meter.
 */
export function prepaidSnapshotFromWallet(
  wallet: Wallet | null,
): PrepaidSnapshot | null {
  if (!wallet || wallet.prepaidUnitsTotal <= 0) return null;
  return {
    remaining: wallet.prepaidUnitsRemaining,
    total: wallet.prepaidUnitsTotal,
    expiresAt: wallet.prepaidExpiresAt,
  };
}

/**
 * Prepaid capacity meter. The bar shows what is left and drains towards empty,
 * while the bands still key on what is gone ({@code used = total − remaining}), so
 * it WARNs when the pool is running low and DEGRADEs once exhausted — same bands
 * as the free/cap meters. Prepaid is consumed ahead of the meter and outside the
 * spend cap, so it reads as its own dimension.
 */
export function PrepaidCapacityMeterPanel({ snap }: { snap: PrepaidSnapshot }) {
  const { t } = useTranslation();
  const { state, pct } = remainingMeter(snap.remaining, snap.total);
  const stateLabel =
    state === "DEGRADED"
      ? t("payg.prepaid.state.exhausted", "Used up")
      : state === "WARNED"
        ? t("payg.prepaid.state.low", "Running low")
        : t("payg.prepaid.state.healthy", "Plenty left");

  return (
    <MeterBar
      state={state}
      pct={pct}
      barLabel={t("payg.prepaid.card.title", "Prepaid capacity")}
      figure={snap.remaining.toLocaleString()}
      capSuffix={t(
        "payg.prepaid.meter.capSuffix",
        "of {{total}} prepaid credits",
        {
          total: snap.total.toLocaleString(),
        },
      )}
      statusLabel={stateLabel}
      meta={
        snap.expiresAt ? (
          <span>
            {t("payg.prepaid.meter.expires", "Expires {{date}}", {
              date: formatPeriodDate(snap.expiresAt, { year: true }),
            })}
          </span>
        ) : undefined
      }
    />
  );
}
