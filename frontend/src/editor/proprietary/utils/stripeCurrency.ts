/** Stripe charge units differ from ISO defaults for ISK, UGX and MGA. */
export function stripeMinorUnitScale(
  currency: string | null | undefined,
): number {
  const code = (currency || "usd").toLowerCase();
  if (code === "isk" || code === "ugx") return 100;
  if (code === "mga") return 1;
  const digits = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
  }).resolvedOptions().maximumFractionDigits;
  return 10 ** (digits ?? 2);
}

/** Converts Stripe amounts, including fractional per-unit prices, without changing currency. */
export function stripeAmountToMajor(
  amount: number,
  currency: string | null | undefined,
): number {
  return amount / stripeMinorUnitScale(currency);
}
