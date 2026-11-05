/** Money formatting for the procurement surface. */

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
