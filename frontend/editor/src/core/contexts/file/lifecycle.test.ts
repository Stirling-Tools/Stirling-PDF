import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileLifecycleManager } from "@app/contexts/file/lifecycle";

describe("FileLifecycleManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes tracked blob URLs during cleanup", () => {
    const filesRef = {
      current: new Map<string, File>([
        ["file-1", new File(["pdf"], "file.pdf")],
      ]),
    };
    const dispatch = vi.fn();
    const manager = new FileLifecycleManager(filesRef, dispatch);
    const blobUrl = "blob:file-1";
    manager.trackBlobUrl(blobUrl);

    manager.cleanupAllFiles();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
