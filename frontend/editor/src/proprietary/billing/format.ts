/**
 * Pure money/meter helpers shared by the editor cloud surface and the admin
 * portal. These carry backend-coupled invariants (the cap→PDF estimate mirrors
 * the server's {@code docCapForMoney}; the meter bands mirror the BE warn/degrade
 * thresholds), so keeping one copy is what stops the FE estimate silently
 * diverging from the backend when a rate encoding changes.
 */

/** Quick-amount cap presets (major currency units) offered everywhere. */
export const DEFAULT_CAP_PRESETS = [500, 1000, 2500, 5000] as const;

/** Compact currency symbol; falls back to the ISO code for anything unmapped. */
export function currencySymbol(currency: string | null | undefined): string {
  switch ((currency ?? "").toLowerCase()) {
    case "usd":
    case "":
      return "$";
    case "eur":
      return "€";
    case "gbp":
      return "£";
    default:
      return (currency ?? "").toUpperCase() + " ";
  }
}

/**
 * Format minor units as a compact-symbol amount ("$2.24", "£0.40"). Uses the
 * short symbol (not Intl's "US$" currency display) and allows up to 3 fraction
 * digits so sub-cent per-document rates don't round to $0.
 */
export function formatMinor(
  minor: number,
  currency: string | null | undefined,
): string {
  const num = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(minor / 100);
  return `${currencySymbol(currency)}${num}`;
}

/** Format a major-unit amount with the compact symbol ("$1,000", "€500"). */
export function formatMoneyMajor(
  major: number,
  currency: string | null | undefined,
): string {
  return `${currencySymbol(currency)}${major.toLocaleString()}`;
}

/**
 * Paid PDFs a monthly cap buys — mirror of the backend's {@code docCapForMoney}:
 * floor(capMinor / rate). The one-time free grant is a separate lifetime pool and
 * is NOT added here. Returns null when there's no cap or no resolvable rate (the
 * caller hides the estimate).
 */
export function docCapForMoney(
  capUsdMajor: number | null,
  pricePerDocMinor: number | null | undefined,
): number | null {
  if (capUsdMajor == null) return null;
  const rate =
    pricePerDocMinor != null && pricePerDocMinor > 0 ? pricePerDocMinor : null;
  return rate != null ? Math.floor((capUsdMajor * 100) / rate) : null;
}

/**
 * Short date for billing labels: "24 Jun" (period meters) or "24 Jun 2026" with
 * {@code year}. Parses the date part of an ISO string as a local date.
 */
export function formatPeriodDate(
  iso: string | null,
  opts?: { year?: boolean },
): string {
  if (!iso) return "";
  const datePart = iso.split("T")[0];
  if (!datePart) return "";
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return datePart;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      ...(opts?.year ? { year: "numeric" } : {}),
    }).format(new Date(y, m - 1, d));
  } catch {
    return datePart;
  }
}

export type MeterState = "FULL" | "WARNED" | "DEGRADED";

/** Warn (≥80%) / degrade (≥100%) band for a usage meter; mirrors the BE thresholds. */
export function meterState(
  used: number,
  limit: number,
): { state: MeterState; pct: number } {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  const state: MeterState =
    pct >= 100 ? "DEGRADED" : pct >= 80 ? "WARNED" : "FULL";
  return { state, pct };
}
