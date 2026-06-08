import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";

import { watchFolderFileStorage } from "@app/services/watchFolderFileStorage";
import { getPolicyLiveData } from "@app/services/policyLiveData";

describe("getPolicyLiveData", () => {
  it("derives activity + stats from the backing folder's run state", async () => {
    const folderId = "pol-folder-live";
    await watchFolderFileStorage.addFileToFolder(folderId, "f1", {
      status: "processed",
      processedAt: new Date(),
      name: "contract.pdf",
    });
    await watchFolderFileStorage.addFileToFolder(folderId, "f2", {
      status: "error",
      errorMessage: "Tool failed",
      name: "broken.pdf",
    });

    const data = await getPolicyLiveData(folderId);
    expect(data.stats.enforced).toBe(1); // one processed
    expect(data.stats.dataProcessed).toBe("2 files");
    expect(data.activity).toHaveLength(2);
    expect(data.activity.find((a) => a.doc === "broken.pdf")?.status).toBe(
      "flagged",
    );
    expect(data.activity.find((a) => a.doc === "contract.pdf")?.status).toBe(
      "enforced",
    );
  });

  it("returns empty live data when the folder has no run record", async () => {
    const data = await getPolicyLiveData("no-such-folder");
    expect(data.activity).toEqual([]);
    expect(data.stats.enforced).toBe(0);
  });
});
