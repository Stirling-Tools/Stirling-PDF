import { describe, it, expect } from "vitest";
import {
  estimateMonthlyVolumeFromUsers,
  provisionMonthlyVolume,
  bundlePoolCredits,
  bundleListMinor,
  bundlePriceMinor,
  computeBundleQuote,
} from "@app/billing";

/**
 * The run-based prepaid brain must mirror the marketing calculator (users → volume,
 * ~3× provisioning, size-folded run pool, 12-for-10) so the buyer sees the number the
 * server charges. The pool is the Stripe line quantity + the credited pool, in the
 * same size-scaled runs the meter charges on consumption.
 */
describe("prepaid bundle brain", () => {
  it("estimates monthly volume from users (× 80/user, clean step)", () => {
    expect(estimateMonthlyVolumeFromUsers(25)).toBe(2000); // 25 × 80
    expect(estimateMonthlyVolumeFromUsers(300)).toBe(24000); // ≥20k → 500 step
    expect(estimateMonthlyVolumeFromUsers(0)).toBe(0);
  });

  it("provisions ~3× above expected, rounded up to a clean magnitude", () => {
    expect(provisionMonthlyVolume(1000)).toBe(5000); // target 3000 → 5×1000
    expect(provisionMonthlyVolume(2000)).toBe(10000); // target 6000 → 10×1000
    expect(provisionMonthlyVolume(0)).toBe(0);
  });

  it("sizes the pool in size-folded runs (volume × policies × pipelines × size × 12)", () => {
    // 10,000/mo × Governed(4 policies) × None(×1) × Standard(×1.2) × 12.
    expect(bundlePoolCredits(10000, 4, 1, 1.2)).toBe(576_000);
    // Size ×1 → 10,000 × 4 × 1 × 12.
    expect(bundlePoolCredits(10000, 4, 1, 1.0)).toBe(480_000);
    // Pipelines multiply runs like policies do.
    expect(bundlePoolCredits(10000, 4, 2, 1.0)).toBe(960_000);
  });

  it("zeroes the pool for non-positive inputs", () => {
    expect(bundlePoolCredits(0, 4, 1, 1.2)).toBe(0);
    expect(bundlePoolCredits(10000, 0, 1, 1.2)).toBe(0);
    expect(bundlePoolCredits(10000, 4, 0, 1.2)).toBe(0);
  });

  it("computes an end-to-end quote from users + finer settings", () => {
    const q = computeBundleQuote({
      users: 25,
      posturePolicies: 4,
      sizeMult: 1.2,
      pipelineMult: 1,
      ratePerRunMinor: 1,
    });
    expect(q.expectedMonthlyVolume).toBe(2000);
    expect(q.provisionedMonthlyVolume).toBe(10000);
    expect(q.poolCredits).toBe(576_000);
    expect(q.listMinor).toBe(576_000); // 576k credits × 1¢
    expect(q.priceMinor).toBe(480_000); // × 10/12
    expect(q.savingsMinor).toBe(96_000);
    expect(q.overEnterprise).toBe(false);
  });

  it("flags enterprise scale on EXPECTED (not provisioned) runs/yr over the ceiling", () => {
    const q = computeBundleQuote({
      users: 3000,
      posturePolicies: 7,
      sizeMult: 2.0,
      pipelineMult: 10,
      ratePerRunMinor: 1,
    });
    // expected 240k/mo × 7 × 10 × 12 ≫ 1M runs/yr.
    expect(q.overEnterprise).toBe(true);
  });

  it("hides money when the rate is unknown", () => {
    const q = computeBundleQuote({
      users: 25,
      posturePolicies: 4,
      sizeMult: 1.2,
      pipelineMult: 1,
      ratePerRunMinor: null,
    });
    expect(q.poolCredits).toBe(576_000);
    expect(q.listMinor).toBeNull();
    expect(q.priceMinor).toBeNull();
    expect(q.savingsMinor).toBeNull();
  });

  it("applies the 12-for-10 discount at the per-run rate", () => {
    // 120k credits × 2 minor = 240,000 list; × 10/12 = 200,000 paid.
    expect(bundleListMinor(120_000, 2)).toBe(240_000);
    expect(bundlePriceMinor(120_000, 2)).toBe(200_000);
  });

  it("rounds sub-cent rates to the minor unit (HALF_UP)", () => {
    // 100k × 0.5 = 50,000 list; × 10/12 = 41,666.67 → 41,667.
    expect(bundleListMinor(100_000, 0.5)).toBe(50_000);
    expect(bundlePriceMinor(100_000, 0.5)).toBe(41_667);
  });

  it("returns null money when the rate is unknown or non-positive", () => {
    expect(bundleListMinor(120_000, null)).toBeNull();
    expect(bundlePriceMinor(120_000, null)).toBeNull();
    expect(bundlePriceMinor(120_000, 0)).toBeNull();
  });
});
