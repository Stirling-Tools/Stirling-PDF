import { describe, it, expect } from "vitest";
import { adaptSaasWallet } from "@portal/api/saasWallet";

describe("adaptSaasWallet — SaaS WalletSnapshotResponse -> portal WalletContract", () => {
  it("free team with grant remaining maps to subscriptionStatus=none, FULL", () => {
    const wallet = adaptSaasWallet({
      status: "free",
      freeRemaining: 380,
      billableLimit: 500,
      spendUnitsThisPeriod: 120,
    });
    expect(wallet.subscriptionStatus).toBe("none");
    expect(wallet.freeUnitsRemaining).toBe(380);
    expect(wallet.monthlyCapUnits).toBe(500);
    expect(wallet.periodSpend).toBe(120);
    expect(wallet.state).toBe("FULL");
  });

  it("free team with low grant remaining is WARNED", () => {
    const wallet = adaptSaasWallet({
      status: "free",
      freeRemaining: 40,
      billableLimit: 500,
      spendUnitsThisPeriod: 460,
    });
    expect(wallet.state).toBe("WARNED");
  });

  it("free team with exhausted grant is DEGRADED", () => {
    const wallet = adaptSaasWallet({
      status: "free",
      freeRemaining: 0,
      billableLimit: 500,
      spendUnitsThisPeriod: 500,
    });
    expect(wallet.state).toBe("DEGRADED");
  });

  it("subscribed uncapped team maps to FULL regardless of spend", () => {
    const wallet = adaptSaasWallet({
      status: "subscribed",
      freeRemaining: 0,
      billableLimit: null,
      spendUnitsThisPeriod: 50_000,
    });
    expect(wallet.subscriptionStatus).toBe("active");
    expect(wallet.monthlyCapUnits).toBeNull();
    expect(wallet.state).toBe("FULL");
  });

  it("subscribed team near the cap is WARNED", () => {
    const wallet = adaptSaasWallet({
      status: "subscribed",
      freeRemaining: 0,
      billableLimit: 1000,
      spendUnitsThisPeriod: 920,
    });
    expect(wallet.state).toBe("WARNED");
  });

  it("subscribed team at or over the cap is DEGRADED", () => {
    const wallet = adaptSaasWallet({
      status: "subscribed",
      freeRemaining: 0,
      billableLimit: 1000,
      spendUnitsThisPeriod: 1000,
    });
    expect(wallet.state).toBe("DEGRADED");
  });

  it("unknown subscription strings conservatively map to none", () => {
    const wallet = adaptSaasWallet({
      status: "trialing",
      freeRemaining: 500,
      billableLimit: 500,
      spendUnitsThisPeriod: 0,
    });
    expect(wallet.subscriptionStatus).toBe("none");
  });
});
