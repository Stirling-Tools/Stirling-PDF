import { describe, it, expect, vi, afterEach } from "vitest";

import { fileStorage } from "@app/services/fileStorage";
import { getPolicyLiveData } from "@app/services/policyLiveData";

function stub(over: Record<string, unknown>) {
  // Minimal StirlingFileStub shape for the fields getPolicyLiveData reads.
  return { id: "x", name: "f.pdf", size: 0, createdAt: Date.now(), ...over };
}

afterEach(() => vi.restoreAllMocks());

describe("getPolicyLiveData (all uploaded files)", () => {
  it("derives activity + stats from the app's uploaded files", async () => {
    vi.spyOn(fileStorage, "getLeafStirlingFileStubs").mockResolvedValue([
      stub({ name: "contract.pdf", size: 2_100_000, createdAt: Date.now() }),
      stub({ name: "invoice.pdf", size: 900_000, createdAt: Date.now() - 1000 }),
    ] as never);

    const data = await getPolicyLiveData();
    expect(data.stats.enforced).toBe(2);
    expect(data.stats.dataProcessed).toBe("2.9 MB");
    expect(data.activity).toHaveLength(2);
    // Most-recent first.
    expect(data.activity[0].doc).toBe("contract.pdf");
    expect(data.activity[0].status).toBe("enforced");
    expect(data.activity[0].action).toContain("2.0 MB");
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
