import { describe, expect, it } from "vitest";
import {
  isUnlimitedUserLimit,
  resolveUserCapacity,
  UNLIMITED_USER_LIMIT,
} from "@app/billing/userCapacity";

/** `calculateMaxAllowedUsers()` returns this for any licence with `users: 0`. */
const JAVA_INT_MAX = 2147483647;

describe("isUnlimitedUserLimit", () => {
  it.each([
    ["the Java sentinel", JAVA_INT_MAX],
    ["zero", 0],
    ["a negative", -1],
    ["undefined", undefined],
    ["null", null],
    ["the threshold itself", UNLIMITED_USER_LIMIT],
  ])("treats %s as unlimited", (_label, value) => {
    expect(isUnlimitedUserLimit(value)).toBe(true);
  });

  it.each([1, 5, 100, 500, 99_999])("treats %i as a real cap", (value) => {
    expect(isUnlimitedUserLimit(value)).toBe(false);
  });
});

describe("resolveUserCapacity", () => {
  it("reports a legacy Server licence as unlimited rather than as its sentinel", () => {
    const capacity = resolveUserCapacity({
      used: 64,
      maxAllowedUsers: JAVA_INT_MAX,
      premiumEnabled: true,
    });

    expect(capacity.kind).toBe("unlimited");
    expect(capacity.limit).toBeNull();
    expect(capacity.remaining).toBeNull();
    expect(capacity.atCapacity).toBe(false);
    expect(capacity.nearLimit).toBe(false);
  });

  it("resolves a Team licence to blocks, not seats", () => {
    const capacity = resolveUserCapacity({
      used: 64,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
    });

    expect(capacity.kind).toBe("blocks");
    expect(capacity.limit).toBe(200);
    expect(capacity.remaining).toBe(136);
    expect(capacity.blocks).toBe(2);
    expect(capacity.blockSize).toBe(100);
  });

  it("resolves an Enterprise seat licence to seats", () => {
    const capacity = resolveUserCapacity({
      used: 64,
      maxAllowedUsers: 250,
      serverQuantity: 0,
      premiumEnabled: true,
    });

    expect(capacity.kind).toBe("seats");
    expect(capacity.limit).toBe(250);
  });

  it("resolves an unlicensed install to free", () => {
    const capacity = resolveUserCapacity({
      used: 4,
      maxAllowedUsers: 5,
      premiumEnabled: false,
    });

    expect(capacity.kind).toBe("free");
    expect(capacity.remaining).toBe(1);
  });

  it("flags near-limit at 80 percent and not before", () => {
    const at = resolveUserCapacity({
      used: 160,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
    });
    const below = resolveUserCapacity({
      used: 159,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
    });

    expect(at.nearLimit).toBe(true);
    expect(below.nearLimit).toBe(false);
  });

  it("flags at-capacity, and never reports negative headroom when over", () => {
    const capacity = resolveUserCapacity({
      used: 205,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
    });

    expect(capacity.atCapacity).toBe(true);
    expect(capacity.remaining).toBe(0);
  });

  it("carries the accounts that hold a slot without being visibly active", () => {
    const capacity = resolveUserCapacity({
      used: 200,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
      disabled: 14,
      pendingInvites: 6,
    });

    expect(capacity.disabled).toBe(14);
    expect(capacity.pendingInvites).toBe(6);
  });

  it("does not claim blocks when the licence carries a quantity but no block size", () => {
    const capacity = resolveUserCapacity({
      used: 10,
      maxAllowedUsers: 250,
      serverQuantity: 2,
      userBlockSize: 0,
      premiumEnabled: true,
    });

    expect(capacity.kind).toBe("seats");
    expect(capacity.blocks).toBe(0);
  });
});
