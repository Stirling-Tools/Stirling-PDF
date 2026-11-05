import type { QuoteConfigInput } from "@processor/api/procurement";

export const TERM_DISCOUNT = [0, 0.03, 0.05, 0.06, 0.07]; // 1..5 years — meter-only discount (D71)
// Governance posture: the intensity (runs per PDF) fed to the committed-volume curve.
export const POSTURES = [
  { intensity: 2, key: "essentials" },
  { intensity: 4, key: "governed" },
  { intensity: 7, key: "regulated" },
] as const;
// PDF-size tiers (D93): a multiplier on the rate. Default Standard (×1.4). Mirrors the server.
export const SIZE_TIERS = [
  { mult: 1.0, key: "compact" },
  { mult: 1.4, key: "standard" },
  { mult: 2.4, key: "heavy" },
] as const;

/** Flat add-on prices, in cents; must equal the server's PricingRates.defaults(). */
export const QBR_ANNUAL_MINOR = 800_000;
export const TRAINING_MINOR = 750_000;

export function estimateVolume(users: number): number {
  const raw = Math.max(0, users) * 5 * 230 * 1.75;
  const stepSize = raw >= 1_000_000 ? 50_000 : raw >= 100_000 ? 25_000 : 5_000;
  // A small team still processes something: rounding it to zero would leave nothing to price.
  return raw > 0
    ? Math.max(stepSize, Math.round(raw / stepSize) * stepSize)
    : 0;
}

// Client mirror of the server pricing curve (ProcurementPricingService / quotePricing). The server
// is authoritative; this only drives the live footer estimate. Minor units (cents); the meter
// rounds to whole dollars, exactly like the backend, so the preview matches the issued quote.
// Exported for the pricing-parity test, which pins this client estimate to the mock and the
// server's published fixtures so a rate-card change can't silently desync the footer from the
// issued quote. This copy stays non-authoritative — the backend prices the real quote.
/** Dollars per run after the committed-volume curve, its floor and the PDF-size multiplier. */
export function perRunRate(cfg: QuoteConfigInput): number {
  const LIST = 0.01;
  const FLOOR = 0.005;
  const runVol = Math.max(0, cfg.volume) * Math.max(1, cfg.intensity);
  const volDisc =
    runVol > 1_000_000
      ? Math.min(0.5, 0.06 * Math.log2(runVol / 1_000_000))
      : 0;
  return Math.max(FLOOR, LIST * (1 - volDisc)) * (cfg.sizeMult || 1);
}

export function previewAnnualMinor(cfg: QuoteConfigInput): number {
  const runVol = Math.max(0, cfg.volume) * Math.max(1, cfg.intensity);
  const rate = perRunRate(cfg);
  const termDisc = TERM_DISCOUNT[Math.min(Math.max(cfg.termYears, 1), 5) - 1];
  const meterNet = Math.round(runVol * rate * (1 - termDisc)) * 100; // whole $ → minor units
  const support = cfg.serviceLevel === "dedicated" ? 3_000_000 : 0; // std + priority included
  const deploy =
    cfg.deployment === "airgap"
      ? 3_600_000
      : cfg.deployment === "selfhost"
        ? 1_200_000
        : 0;
  const indemnity = cfg.indemnification ? Math.round(meterNet * 0.05) : 0;
  const qbr = cfg.qbr ? QBR_ANNUAL_MINOR : 0;
  return meterNet + support + deploy + indemnity + qbr;
}
