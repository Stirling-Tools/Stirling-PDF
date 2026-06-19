import { beforeEach, describe, expect, it } from "vitest";
import {
  listInstances,
  registerInstance,
  resetLinkStore,
  revokeInstance,
} from "@portal/mocks/link";

describe("mocks/link store", () => {
  beforeEach(() => resetLinkStore());

  it("lists seed instances newest-first", () => {
    const rows = listInstances();
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].instanceId).toBeGreaterThan(rows[i].instanceId);
    }
  });

  it("registers a new active instance with a one-time secret", () => {
    const before = listInstances().length;
    const cred = registerInstance("new-node");
    expect(cred.name).toBe("new-node");
    expect(cred.deviceSecret).toMatch(/^sk_link_/);
    expect(cred.deviceId).toMatch(/[0-9a-f-]{36}/);

    const rows = listInstances();
    expect(rows.length).toBe(before + 1);
    const added = rows.find((r) => r.instanceId === cred.instanceId);
    expect(added).toBeDefined();
    expect(added?.revoked).toBe(false);
    expect(added?.lastSeenAt).toBeNull();
  });

  it("registers without a name as null", () => {
    expect(registerInstance().name).toBeNull();
  });

  it("revokes an instance and is idempotent", () => {
    const id = listInstances().find((r) => !r.revoked)!.instanceId;
    expect(revokeInstance(id)).toBe(true);
    expect(listInstances().find((r) => r.instanceId === id)?.revoked).toBe(true);
    // Idempotent — revoking again still returns true.
    expect(revokeInstance(id)).toBe(true);
  });

  it("returns false revoking an unknown instance", () => {
    expect(revokeInstance(999_999)).toBe(false);
  });

  it("resets to seed state", () => {
    registerInstance("temp");
    const grown = listInstances().length;
    resetLinkStore();
    expect(listInstances().length).toBeLessThan(grown);
  });
});
