import type { GoldenSet } from "@portal/api/pipelines";
import type { StatusTone } from "@shared/components";

/** Fraction → percentage string (0.004 → "0.40%"). */
export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/** Compact count for dense metric tiles (28941 → "28.9K"). */
export const compact = (n: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

/**
 * Golden-set reliability tone, judged against the pipeline's own pass-rate
 * bound. At/above bound is green; a small slip under is amber; a clear miss is
 * danger — so a row's reliability reads from colour alone.
 */
export function goldenTone(golden: GoldenSet): StatusTone {
  if (golden.total === 0) return "neutral";
  const rate = golden.passing / golden.total;
  if (rate >= golden.threshold) return "success";
  // Within five points of the bound is a warning; further off is a hard miss.
  if (rate >= golden.threshold - 0.05) return "warning";
  return "danger";
}
