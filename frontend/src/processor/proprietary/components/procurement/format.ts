/** Money, date and trial formatting for the procurement surface. */
import type { TFunction } from "i18next";

/**
 * A currency formatter. Only USD gets the narrow "$"; other currencies keep their full symbol so "$"
 * never stands in for CAD or AUD.
 */
function currencyFormat(currency: string, digits: number): Intl.NumberFormat {
  const code = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    currencyDisplay: code === "USD" ? "narrowSymbol" : "symbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Format a minor-unit (cents) amount in whole units. */
export function money(minor: number, currency: string = "USD"): string {
  return currencyFormat(currency, 0).format(minor / 100);
}

/** Format a per-unit rate in whole units, to four decimals: rates run to fractions of a cent. */
export function unitRate(amount: number, currency: string = "USD"): string {
  return currencyFormat(currency, 4).format(amount);
}

const DAY_MS = 86_400_000;

/** Whole days until `iso`, counting a part day as one; 0 once it has passed. */
export function daysLeft(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS),
  );
}

/** How long the trial ending at `iso` has left, or that it has expired. */
export function trialLeftLabel(t: TFunction, iso: string): string {
  const left = daysLeft(iso);
  return left === 0
    ? t("portal.procurement.journey.expired", "Trial expired")
    : t("portal.procurement.journey.daysLeft", { count: left });
}

/** A date written out in full, such as "15 November 2026"; a dash when there is none. */
export function longDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}
