/** Money formatting for the procurement surface. */

export const USD = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Format a minor-unit (cents) amount as whole USD (no decimals). USD only for now. */
export function money(minor: number, currency: string = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
