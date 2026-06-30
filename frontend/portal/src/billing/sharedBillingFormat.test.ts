import { describe, expect, it } from "vitest";
import {
  currencySymbol,
  docCapForMoney,
  formatMinor,
  formatPeriodDate,
  meterState,
} from "@shared/billing";

/**
 * Unit tests for the @shared/billing money/meter helpers the portal billing
 * surface (and the editor cloud surface) depend on. docCapForMoney mirrors the
 * backend's cap→PDF conversion and meterState mirrors the BE warn/degrade bands,
 * so these invariants matter beyond cosmetics.
 */
describe("docCapForMoney", () => {
  it("returns null when there is no cap", () => {
    expect(docCapForMoney(null, 2)).toBeNull();
  });

  it("returns null when the rate is unresolved or non-positive", () => {
    expect(docCapForMoney(1000, null)).toBeNull();
    expect(docCapForMoney(1000, 0)).toBeNull();
    expect(docCapForMoney(1000, -5)).toBeNull();
  });

  it("floors capMinor / rate (the backend mirror)", () => {
    // $1000 cap, 2 minor units / doc → floor(100000 / 2) = 50000 PDFs.
    expect(docCapForMoney(1000, 2)).toBe(50000);
    // Sub-cent rate (0.5 minor) → floor(100000 / 0.5) = 200000.
    expect(docCapForMoney(1000, 0.5)).toBe(200000);
    // Floors a partial PDF down.
    expect(docCapForMoney(10, 3)).toBe(333);
  });

  it("treats a $0 cap as zero paid PDFs", () => {
    expect(docCapForMoney(0, 2)).toBe(0);
  });
});

describe("meterState", () => {
  it("is FULL below the warn band", () => {
    expect(meterState(10, 100).state).toBe("FULL");
    expect(meterState(79, 100).state).toBe("FULL");
  });

  it("is WARNED from 80% up to (not including) 100%", () => {
    expect(meterState(80, 100).state).toBe("WARNED");
    expect(meterState(99, 100).state).toBe("WARNED");
  });

  it("is DEGRADED at and above 100%, with pct clamped to 100", () => {
    expect(meterState(100, 100)).toEqual({ state: "DEGRADED", pct: 100 });
    const over = meterState(500, 100);
    expect(over.state).toBe("DEGRADED");
    expect(over.pct).toBe(100);
  });

  it("treats a non-positive limit as fully consumed", () => {
    expect(meterState(0, 0)).toEqual({ state: "DEGRADED", pct: 100 });
  });
});

describe("currencySymbol", () => {
  it("maps known currencies and defaults empty/usd to $", () => {
    expect(currencySymbol("usd")).toBe("$");
    expect(currencySymbol("")).toBe("$");
    expect(currencySymbol(null)).toBe("$");
    expect(currencySymbol("eur")).toBe("€");
    expect(currencySymbol("gbp")).toBe("£");
  });

  it("falls back to the upper-cased code for anything unmapped", () => {
    expect(currencySymbol("cad")).toBe("CAD ");
  });
});

describe("formatMinor", () => {
  it("formats whole and fractional cents", () => {
    expect(formatMinor(224, "usd")).toContain("2.24");
    expect(formatMinor(5, "usd")).toContain("0.05");
  });

  it("keeps up to 3 fraction digits so sub-cent rates don't round to $0", () => {
    expect(formatMinor(0.5, "usd")).toContain("0.005");
  });
});

describe("formatPeriodDate", () => {
  it("returns an empty string for null", () => {
    expect(formatPeriodDate(null)).toBe("");
  });

  it("formats the date part of an ISO string", () => {
    const out = formatPeriodDate("2026-06-24");
    expect(out).toContain("Jun");
    expect(out).toContain("24");
  });

  it("includes the year only when asked", () => {
    expect(formatPeriodDate("2026-06-24")).not.toContain("2026");
    expect(formatPeriodDate("2026-06-24", { year: true })).toContain("2026");
  });
});
