import { describe, expect, it } from "vitest";
import { buildWalletContract } from "@portal/mocks/usage";

describe("buildWalletContract", () => {
  it("free: no subscription, free grant left, uncapped, warned", () => {
    const w = buildWalletContract("free");
    expect(w.subscriptionStatus).toBe("none");
    expect(w.freeUnitsRemaining).toBeGreaterThan(0);
    expect(w.monthlyCapUnits).toBeNull();
    expect(w.state).toBe("WARNED");
  });

  it("pro: active subscription, capped, under the cap", () => {
    const w = buildWalletContract("pro");
    expect(w.subscriptionStatus).toBe("active");
    expect(w.monthlyCapUnits).not.toBeNull();
    expect(w.periodSpend).toBeLessThan(w.monthlyCapUnits!);
  });

  it("enterprise: active and uncapped", () => {
    const w = buildWalletContract("enterprise");
    expect(w.subscriptionStatus).toBe("active");
    expect(w.monthlyCapUnits).toBeNull();
    expect(w.state).toBe("FULL");
  });
});
