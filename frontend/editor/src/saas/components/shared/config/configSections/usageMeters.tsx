/**
 * Compact usage meters shared by the Plan section and the usage-limit warning
 * modals. Kept in their own module (rather than inside Payg/PaygFree) so the
 * modals can render a meter without pulling in the upgrade-checkout subtree
 * (UpgradeModal, useWallet, etc.). Only depends on i18n + the co-located CSS.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWallet, type Wallet } from "@app/hooks/useWallet";
import "@app/components/shared/config/configSections/Payg.css";
import "@app/components/shared/config/configSections/PaygFree.css";

export type MeterState = "FULL" | "WARNED" | "DEGRADED";

/** Warn/degrade band for a usage meter (mirrors the BE thresholds). */
export function meterState(
  used: number,
  limit: number,
): { state: MeterState; pct: number } {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  const state: MeterState =
    pct >= 100 ? "DEGRADED" : pct >= 80 ? "WARNED" : "FULL";
  return { state, pct };
}

/** Currency symbol for compact inline use; falls back to the ISO code. */
function currencySymbol(currency: string | null): string {
  switch ((currency ?? "").toLowerCase()) {
    case "usd":
      return "$";
    case "eur":
      return "€";
    case "gbp":
      return "£";
    default:
      return currency ? currency.toUpperCase() + " " : "$";
  }
}

// ─── One-time free grant meter ──────────────────────────────────────────────

export interface FreeSnapshot {
  /** One-time free documents used so far (grant − remaining). */
  billableUsed: number;
  /** The team's one-time free grant size in documents. */
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
  const { state, pct } = meterState(snap.billableUsed, snap.billableLimit);
  const stateLabel =
    state === "DEGRADED"
      ? t("payg.free.state.limitReached", "Limit reached")
      : state === "WARNED"
        ? t("payg.free.state.approachingLimit", "Approaching limit")
        : t("payg.free.state.plentyLeft", "Plenty left");

  return (
    <div className="paygf-meter" data-state={state}>
      <div className="paygf-meter__top">
        <div className="paygf-meter__figure">
          <span className="paygf-meter__num">
            {snap.billableUsed.toLocaleString()}
          </span>
          <span className="paygf-meter__cap">
            {t("payg.free.hero.capSuffix", "/ {{limit}} free PDFs", {
              limit: snap.billableLimit.toLocaleString(),
            })}
          </span>
        </div>
        <span className="payg-status" data-state={state}>
          <span className="payg-status__dot" />
          {stateLabel}
        </span>
      </div>

      <div className="payg-bar">
        <div
          className="payg-bar__fill"
          data-state={state}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="paygf-meter__meta">
        <span>
          {t("payg.free.hero.metaCategories", "Automation · AI · API requests")}
        </span>
      </div>
    </div>
  );
}

// ─── Monthly spend-cap meter ────────────────────────────────────────────────

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
 * Sibling of {@link FreeMeterPanel} for the money cap rather than the one-time
 * free grant. Shares the same bar/status styling and the cap-state labels
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
    <div className="paygf-meter" data-state={state}>
      <div className="paygf-meter__top">
        <div className="paygf-meter__figure">
          <span className="paygf-meter__num">
            {symbol}
            {snap.spent.toLocaleString()}
          </span>
          <span className="paygf-meter__cap">
            {t("payg.spendCapMeter.capSuffix", "/ {{amount}} cap", {
              amount: `${symbol}${snap.cap.toLocaleString()}`,
            })}
          </span>
        </div>
        <span className="payg-status" data-state={state}>
          <span className="payg-status__dot" />
          {stateLabel}
        </span>
      </div>

      <div className="payg-bar">
        <div
          className="payg-bar__fill"
          data-state={state}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="paygf-meter__meta">
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
      </div>
    </div>
  );
}
