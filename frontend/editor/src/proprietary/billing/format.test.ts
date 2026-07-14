import { describe, it, expect } from "vitest";
import {
  bundleCapacityUnits,
  bundleListMinor,
  bundlePriceMinor,
} from "@app/billing";

/**
 * The prepaid-bundle math must mirror the backend PrepaidPurchaseService (units ×
 * rate × 10/12) so the calculator's live estimate matches the server quote the
 * buyer pays. These cases use the same numbers as PrepaidPurchaseServiceTest.
 */
describe("bundle pricing helpers", () => {
  it("folds size into capacity (volume × posture × size × 12)", () => {
    // 5,000/mo × Governed(2.4) × Standard(1.4) × 12 months.
    expect(bundleCapacityUnits(5000, 2.4, 1.4)).toBe(201_600);
    // Size ×1 → capacity is just volume × posture × 12.
    expect(bundleCapacityUnits(5000, 2.4, 1.0)).toBe(144_000);
  });

  it("zeroes capacity for non-positive inputs", () => {
    expect(bundleCapacityUnits(0, 2.4, 1.4)).toBe(0);
    expect(bundleCapacityUnits(5000, 0, 1.4)).toBe(0);
  });

  it("applies the 12-for-10 discount, matching the backend quote", () => {
    // 120k units × 2 minor = 240,000 list; × 10/12 = 200,000 paid.
    expect(bundleListMinor(120_000, 2)).toBe(240_000);
    expect(bundlePriceMinor(120_000, 2)).toBe(200_000);
  });

  it("rounds sub-cent rates to the minor unit (HALF_UP), matching the backend", () => {
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
