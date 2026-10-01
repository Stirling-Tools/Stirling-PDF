import { beforeEach, describe, expect, it } from "vitest";
import {
  getLocalStatus,
  linkLocal,
  listInstances,
  resetLinkStore,
  revokeInstance,
  unlinkLocal,
} from "@portal/mocks/link";

describe("mocks/link store", () => {
  beforeEach(() => resetLinkStore());

  it("starts not-linked locally", () => {
    expect(getLocalStatus().linked).toBe(false);
  });

  it("lists seed instances newest-first", () => {
    const rows = listInstances();
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].instanceId).toBeGreaterThan(rows[i].instanceId);
    }
  });

  it("links locally and adds an active instance — without surfacing any secret", () => {
    const before = listInstances().length;
    const status = linkLocal("new-node");
    expect(status.linked).toBe(true);
    expect(status.name).toBe("new-node");
    expect(status).not.toHaveProperty("deviceSecret");

    const rows = listInstances();
    expect(rows.length).toBe(before + 1);
    const added = rows.find((r) => r.name === "new-node");
    expect(added).toBeDefined();
    expect(added?.revoked).toBe(false);
    expect(added?.lastSeenAt).toBeNull();
  });

  it("links without a name as null", () => {
    expect(linkLocal().name).toBeNull();
  });

  it("unlinks locally", () => {
    linkLocal("temp");
    expect(getLocalStatus().linked).toBe(true);
    expect(unlinkLocal().linked).toBe(false);
  });

  it("revokes an instance and is idempotent", () => {
    const id = listInstances().find((r) => !r.revoked)!.instanceId;
    expect(revokeInstance(id)).toBe(true);
    expect(listInstances().find((r) => r.instanceId === id)?.revoked).toBe(
      true,
    );
    // Idempotent — revoking again still returns true.
    expect(revokeInstance(id)).toBe(true);
  });

  it("returns false revoking an unknown instance", () => {
    expect(revokeInstance(999_999)).toBe(false);
  });

  it("resets to seed state", () => {
    linkLocal("temp");
    const grown = listInstances().length;
    resetLinkStore();
    expect(listInstances().length).toBeLessThan(grown);
    expect(getLocalStatus().linked).toBe(false);
  });
});
