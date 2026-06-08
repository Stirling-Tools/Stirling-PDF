import { describe, it, expect, vi, afterEach } from "vitest";

import { fileStorage } from "@app/services/fileStorage";
import {
  getPolicyLiveData,
  policyActiveFor,
} from "@app/services/policyLiveData";

function stub(over: Record<string, unknown>) {
  // Minimal StirlingFileStub shape for the fields getPolicyLiveData reads.
  return { id: "x", name: "f.pdf", size: 0, createdAt: Date.now(), ...over };
}

afterEach(() => vi.restoreAllMocks());

describe("getPolicyLiveData (all uploaded files)", () => {
  const HOUR = 3_600_000;

  it("derives activity + stats from the app's uploaded files", async () => {
    vi.spyOn(fileStorage, "getLeafStirlingFileStubs").mockResolvedValue([
      stub({
        name: "contract.pdf",
        size: 2_100_000,
        createdAt: Date.now() - HOUR,
      }),
      stub({
        name: "invoice.pdf",
        size: 900_000,
        createdAt: Date.now() - 2 * HOUR,
      }),
    ] as never);

    const data = await getPolicyLiveData();
    expect(data.stats.enforced).toBe(2);
    expect(data.stats.dataProcessed).toBe("2.9 MB");
    expect(data.activity).toHaveLength(2);
    // Most-recent first; older files are settled to "enforced".
    expect(data.activity[0].doc).toBe("contract.pdf");
    expect(data.activity[0].status).toBe("enforced");
    expect(data.activity[0].action).toContain("2.0 MB");
  });

  it("marks just-uploaded files as in progress (enforcing)", async () => {
    vi.spyOn(fileStorage, "getLeafStirlingFileStubs").mockResolvedValue([
      stub({ name: "fresh.pdf", size: 1000, createdAt: Date.now() }),
    ] as never);

    const data = await getPolicyLiveData();
    expect(data.activity[0].status).toBe("processing");
    expect(data.activity[0].action).toBe("Enforcing…");
  });

  it("returns empty live data when nothing has been uploaded", async () => {
    vi.spyOn(fileStorage, "getLeafStirlingFileStubs").mockResolvedValue(
      [] as never,
    );
    const data = await getPolicyLiveData();
    expect(data.activity).toEqual([]);
    expect(data.stats.enforced).toBe(0);
  });
});

describe("policyActiveFor", () => {
  it("returns 'Today' for a just-activated policy", () => {
    expect(policyActiveFor(new Date().toISOString())).toBe("Today");
  });
  it("returns 'Today' when there's no backing folder (seeded policy)", () => {
    expect(policyActiveFor(undefined)).toBe("Today");
  });
  it("reports whole-day duration since activation", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(policyActiveFor(fiveDaysAgo)).toBe("5d");
  });
});
