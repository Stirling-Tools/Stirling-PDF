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

// ─── Prepaid bundle pricing (run-based brain) ───────────────────────────────

/**
 * "12 months for the price of 10" — months granted vs paid. Mirrors the Stripe
 * coupon (10/12 off), so the calculator's live estimate matches the amount charged.
 */
export const PREPAID_MONTHS_GRANTED = 12;
export const PREPAID_MONTHS_PAID = 10;

/**
 * People-driven traffic estimate: one Stirling user runs ≈ this many PDFs a month
 * (WBR telemetry). The self-serve prepay flow sizes the year from USERS and derives
 * volume from this rate rather than asking the buyer to guess a PDF count.
 */
export const PDFS_PER_USER_MONTH = 80;

/**
 * Above this many EXPECTED runs/yr the self-serve prepay flow hands off to the
 * enterprise quote — committed-volume pricing is negotiated, never self-served.
 */
export const BUNDLE_SELF_SERVE_RUN_CEILING_YR = 1_000_000;

/**
 * Governance posture as a policy-run count — the intensity fed to the pricing brain
 * (a PDF through N policies is N runs). Replaces the retired ×1.4/2.4/4.0 posture
 * multiplier: the policy count IS the multiplier now.
 */
export const BUNDLE_POLICY_POSTURES = [
  { id: "essentials", policies: 2 },
  { id: "governed", policies: 4 },
  { id: "regulated", policies: 7 },
] as const;

/** File-size tier — the data multiplier folded into the pool (a bigger PDF draws more). */
export const BUNDLE_SIZE_TIERS = [
  { id: "compact", mult: 1.0 },
  { id: "standard", mult: 1.2 },
  { id: "heavy", mult: 2.0 },
] as const;

/** Pipeline intensity — pipelines multiply runs per PDF exactly like policies do. */
export const BUNDLE_PIPELINE_TIERS = [
  { id: "none", mult: 1 },
  { id: "standard", mult: 2 },
  { id: "advanced", mult: 10 },
] as const;

/**
 * Estimated monthly people-driven PDF volume for a team of {@code users}
 * ({@code users ×} {@link PDFS_PER_USER_MONTH}, rounded to a clean step); zero for a
 * non-positive team size.
 */
export function estimateMonthlyVolumeFromUsers(users: number): number {
  if (users <= 0) return 0;
  const raw = users * PDFS_PER_USER_MONTH;
  const step = raw >= 20000 ? 500 : 100;
  return Math.max(step, Math.round(raw / step) * step);
}

/**
 * Provisioned monthly PDF capacity for an {@code expectedMonthly} volume: ~3× above
 * expected (buyers compare a plan to a stock, not a flow), rounded up to a clean
 * 1/2/2.5/5/10 magnitude. Renewals re-size to observed usage, so generous
 * provisioning stays fair.
 */
export function provisionMonthlyVolume(expectedMonthly: number): number {
  if (expectedMonthly <= 0) return 0;
  const target = expectedMonthly * 3;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) if (s * mag >= target) return Math.round(s * mag);
  return Math.round(10 * mag);
}

/**
 * Prepaid pool size in run-credits for a provisioned monthly PDF volume at a given
 * posture (policy runs/PDF), pipeline intensity, and file-size tier, over the term.
 * The pool is denominated in the SAME size-scaled runs the meter charges on
 * consumption, so buying and spending are one currency; each credit is the list run
 * rate. Size folds in as extra credits.
 */
export function bundlePoolCredits(
  provisionedMonthlyVolume: number,
  posturePolicies: number,
  pipelineMult: number,
  sizeMult: number,
  monthsGranted: number = PREPAID_MONTHS_GRANTED,
): number {
  if (
    provisionedMonthlyVolume <= 0 ||
    posturePolicies <= 0 ||
    pipelineMult <= 0 ||
    sizeMult <= 0
  )
    return 0;
  const runsPerMonth =
    provisionedMonthlyVolume * posturePolicies * pipelineMult;
  return Math.round(runsPerMonth * sizeMult) * monthsGranted;
}

/** Undiscounted "worth" of a pool in minor units (units × rate); null when the rate is unknown. */
export function bundleListMinor(
  units: number,
  ratePerUnitMinor: number | null | undefined,
): number | null {
  const rate =
    ratePerUnitMinor != null && ratePerUnitMinor > 0 ? ratePerUnitMinor : null;
  return rate != null ? Math.round(units * rate) : null;
}

/**
 * Discounted price of a prepaid pool in minor units: units × rate × paid/granted.
 * Mirror of the Stripe coupon. Null when the rate is unknown (the caller hides the
 * figure and falls back to the server total).
 */
export function bundlePriceMinor(
  units: number,
  ratePerUnitMinor: number | null | undefined,
  monthsPaid: number = PREPAID_MONTHS_PAID,
  monthsGranted: number = PREPAID_MONTHS_GRANTED,
): number | null {
  const rate =
    ratePerUnitMinor != null && ratePerUnitMinor > 0 ? ratePerUnitMinor : null;
  return rate != null
    ? Math.round((units * rate * monthsPaid) / monthsGranted)
    : null;
}

/** Inputs to {@link computeBundleQuote} — team size + the finer-setting multipliers. */
export interface BundleQuoteInput {
  /** Team size — the primary sizing input; volume + pool derive from it. */
  users: number;
  /** Governance posture as a policy-run count (2 / 4 / 7). */
  posturePolicies: number;
  /** File-size tier multiplier (1.0 / 1.2 / 2.0). */
  sizeMult: number;
  /** Pipeline intensity multiplier (1 / 2 / 10). */
  pipelineMult: number;
  /** Per-run list rate in minor units; null when unresolved (price is hidden). */
  ratePerRunMinor: number | null | undefined;
}

/** The derived breakdown {@link computeBundleQuote} returns. */
export interface BundleQuoteBreakdown {
  /** People-driven monthly volume estimated from users (pre-provisioning). */
  expectedMonthlyVolume: number;
  /** Provisioned monthly PDF capacity (~3× expected) — the "handles X/mo" headline. */
  provisionedMonthlyVolume: number;
  /** Size-folded runs the pool represents = Stripe line quantity + credited pool. */
  poolCredits: number;
  listMinor: number | null;
  priceMinor: number | null;
  savingsMinor: number | null;
  /** EXPECTED runs/yr exceed the self-serve ceiling → route to the enterprise quote. */
  overEnterprise: boolean;
}

/**
 * The one self-serve prepay pricing brain: team size + finer settings → the pool,
 * price, and enterprise-ladder flag. Volume is derived from users (never asked) and
 * provisioned ~3× above expected; the pool is size-folded runs — the Stripe line
 * quantity AND the credited pool, in the same currency the meter charges on
 * consumption. Mirrors the marketing calculator so the buyer sees the number the
 * server charges.
 */
export function computeBundleQuote(
  input: BundleQuoteInput,
): BundleQuoteBreakdown {
  const { users, posturePolicies, sizeMult, pipelineMult, ratePerRunMinor } =
    input;
  const expectedMonthlyVolume = estimateMonthlyVolumeFromUsers(users);
  const provisionedMonthlyVolume = provisionMonthlyVolume(
    expectedMonthlyVolume,
  );
  const poolCredits = bundlePoolCredits(
    provisionedMonthlyVolume,
    posturePolicies,
    pipelineMult,
    sizeMult,
  );
  const listMinor = bundleListMinor(poolCredits, ratePerRunMinor);
  const priceMinor = bundlePriceMinor(poolCredits, ratePerRunMinor);
  const savingsMinor =
    listMinor != null && priceMinor != null ? listMinor - priceMinor : null;
  const expectedRunsYr =
    Math.round(expectedMonthlyVolume * posturePolicies * pipelineMult) * 12;
  const overEnterprise = expectedRunsYr > BUNDLE_SELF_SERVE_RUN_CEILING_YR;
  return {
    expectedMonthlyVolume,
    provisionedMonthlyVolume,
    poolCredits,
    listMinor,
    priceMinor,
    savingsMinor,
    overEnterprise,
  };
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
