/**
 * The server's pricing formula (ProcurementPricingService), run over the rate card it sends, so the
 * builder's live estimate needs no round trip yet can't drift from the server's figures. The server
 * prices the real quote. Minor units (cents); the meter rounds to whole dollars, exactly like the
 * backend, so the preview matches the issued quote. pricingParity.test.ts pins this formula to the
 * server's fixtures.
 */
import type { QuoteConfigInput, RateCard } from "@processor/api/procurement";

// Governance posture: the intensity (runs per PDF) fed to the committed-volume curve.
export const POSTURES = [
  { intensity: 2, key: "essentials" },
  { intensity: 4, key: "governed" },
  { intensity: 7, key: "regulated" },
] as const;
// PDF-size tiers: a multiplier on the rate. Mirrors the server.
export const SIZE_TIERS = [
  { mult: 1.0, key: "compact" },
  { mult: 1.4, key: "standard" },
  { mult: 2.4, key: "heavy" },
] as const;
/** Where a fresh quote starts: Governed, at the Standard PDF size. */
export const DEFAULT_POSTURE = POSTURES[1];
export const DEFAULT_SIZE_TIER = SIZE_TIERS[1];

/** PDFs a user processes a working day, working days a year, and headroom on top. */
const PDFS_PER_USER_DAY = 5;
const WORKING_DAYS = 230;
const VOLUME_HEADROOM = 1.75;

/** A starting annual volume for a team of this size, rounded to a figure that reads as an estimate. */
export function estimateVolume(users: number): number {
  const raw =
    Math.max(0, users) * PDFS_PER_USER_DAY * WORKING_DAYS * VOLUME_HEADROOM;
  const stepSize = raw >= 1_000_000 ? 50_000 : raw >= 100_000 ? 25_000 : 5_000;
  // A small team still processes something: rounding it to zero would leave nothing to price.
  return raw > 0
    ? Math.max(stepSize, Math.round(raw / stepSize) * stepSize)
    : 0;
}

/** Committed runs a year: PDFs times the policies each one runs through. */
function runVolume(cfg: QuoteConfigInput): number {
  return Math.max(0, cfg.volume) * Math.max(1, cfg.intensity);
}

/** Meter-only discount for a term of this many years, clamped to the terms the card prices. */
export function termDiscount(rates: RateCard, termYears: number): number {
  const byYear = rates.termDiscountByYear;
  return byYear[Math.min(Math.max(termYears, 1), byYear.length) - 1] ?? 0;
}

/** Dollars per run after the committed-volume curve, its floor and the PDF-size multiplier. */
export function perRunRate(cfg: QuoteConfigInput, rates: RateCard): number {
  const runVol = runVolume(cfg);
  const volDisc =
    runVol > rates.runCurveKnee
      ? Math.min(
          rates.maxVolumeDiscount,
          rates.discountPerDoubling * Math.log2(runVol / rates.runCurveKnee),
        )
      : 0;
  return (
    Math.max(rates.floorRatePerRun, rates.listRatePerRun * (1 - volDisc)) *
    (cfg.sizeMult || 1)
  );
}

export function previewAnnualMinor(
  cfg: QuoteConfigInput,
  rates: RateCard,
): number {
  const runVol = runVolume(cfg);
  const rate = perRunRate(cfg, rates);
  const termDisc = termDiscount(rates, cfg.termYears);
  const meterNet = Math.round(runVol * rate * (1 - termDisc)) * 100; // whole $ → minor units
  // Standard and priority support are included.
  const support =
    cfg.serviceLevel === "dedicated" ? rates.dedicatedSupportMinor : 0;
  const deploy =
    cfg.deployment === "airgap"
      ? rates.airgapDeployMinor
      : cfg.deployment === "selfhost"
        ? rates.selfHostDeployMinor
        : 0;
  const indemnity = cfg.indemnification
    ? Math.round(meterNet * rates.indemnificationRate)
    : 0;
  const qbr = cfg.qbr ? rates.qbrAnnualMinor : 0;
  return meterNet + support + deploy + indemnity + qbr;
}
