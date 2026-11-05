/** Money formatting for the procurement surface. */

// Narrow symbol: every amount here is in the one currency, so locales that would print "US$" show
// a plain "$".
export const USD = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

/**
 * Format a minor-unit (cents) amount in whole units. Only USD gets the narrow "$"; other currencies
 * keep their full symbol so "$" never stands in for CAD or AUD.
 */
export function money(minor: number, currency: string = "USD"): string {
  const code = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    currencyDisplay: code === "USD" ? "narrowSymbol" : "symbol",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
