import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileLifecycleManager } from "@app/contexts/file/lifecycle";
import type { FileId } from "@app/types/file";

describe("FileLifecycleManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes tracked blob URLs during cleanup", () => {
    const fileId = "file-1" as FileId;
    const filesRef = {
      current: new Map<FileId, File>([[fileId, new File(["pdf"], "file.pdf")]]),
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
