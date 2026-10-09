// @vitest-environment node
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

  it("renames the held File so tools name their output after the new name", () => {
    const fileId = "file-1" as FileId;
    const original = new File(["pdf"], "old.pdf", {
      type: "application/pdf",
      lastModified: 42,
    });
    const filesRef = { current: new Map<FileId, File>([[fileId, original]]) };
    const manager = new FileLifecycleManager(filesRef, vi.fn());

    manager.updateStirlingFileStub(fileId, { name: "new.pdf" });

    const held = filesRef.current.get(fileId);
    expect(held?.name).toBe("new.pdf");
    expect(held?.type).toBe("application/pdf");
    expect(held?.lastModified).toBe(42);
    expect(held).toMatchObject({ fileId, quickKey: "new.pdf|3|42" });
  });

  it("keeps the held File when the update does not rename", () => {
    const fileId = "file-1" as FileId;
    const original = new File(["pdf"], "file.pdf");
    const filesRef = { current: new Map<FileId, File>([[fileId, original]]) };
    const manager = new FileLifecycleManager(filesRef, vi.fn());

    manager.updateStirlingFileStub(fileId, { isDirty: true });

    expect(filesRef.current.get(fileId)).toBe(original);
  });
});
