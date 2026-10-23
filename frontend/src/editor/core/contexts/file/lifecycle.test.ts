// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileLifecycleManager } from "@editor/contexts/file/lifecycle";
import type { FileId } from "@editor/types/file";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";

describe("FileLifecycleManager", () => {
  afterEach(clearPdfAccess);
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

  it("keeps session access across a rename without retaining access after cleanup", async () => {
    const fileId = "protected-rename" as FileId;
    const original = createStirlingFile(
      new File(["encrypted bytes"], "old.pdf"),
      fileId,
    );
    const access = {
      password: "rename-test",
      encrypted: true,
      signed: false,
      ownerAuthenticated: true,
      permissions: -4,
      pageCount: 1,
    };
    rememberPdfAccess(original, access);
    const filesRef = { current: new Map<FileId, File>([[fileId, original]]) };
    const manager = new FileLifecycleManager(filesRef, vi.fn());
    manager.updateStirlingFileStub(fileId, { name: "renamed.pdf" });
    const renamed = filesRef.current.get(fileId);
    expect(await renamed?.text()).toBe("encrypted bytes");
    expect(getPdfAccess(renamed)).toEqual(access);
    expect(getPdfAccess(fileId)).toEqual(access);
    manager.cleanupAllFiles();
    expect(getPdfAccess(renamed)).toBeUndefined();
    expect(getPdfAccess(fileId)).toBeUndefined();
  });
});
