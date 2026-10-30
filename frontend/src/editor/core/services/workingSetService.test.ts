import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { FileId, StirlingFile } from "@editor/types/fileContext";
import type { StirlingFileStub } from "@editor/types/fileContext";

vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn() },
}));
vi.mock("@editor/services/chunkedUploadService", () => ({
  uploadTemporaryFileInChunks: vi.fn(),
}));

let ensureWorkingSetReference: (typeof import("@editor/services/workingSetService"))["ensureWorkingSetReference"];
let ensureWorkingSetReferences: (typeof import("@editor/services/workingSetService"))["ensureWorkingSetReferences"];
let post: Mock;
let uploadChunked: Mock;

function response(id: number) {
  return { data: { id } };
}

function source(id: string): StirlingFile {
  return { fileId: id as FileId } as StirlingFile;
}

function stub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: "local-1" as FileId,
    name: "document.pdf",
    type: "application/pdf",
    size: 1024,
    lastModified: 1,
    isLeaf: true,
    originalFileId: "local-1",
    versionNumber: 1,
    ...overrides,
  };
}

describe("working set references", () => {
  beforeEach(async () => {
    // The service caches references in module state; a fresh module per test is the reset.
    vi.resetModules();
    sessionStorage.clear();
    const api = await import("@editor/services/apiClient");
    const chunked = await import("@editor/services/chunkedUploadService");
    const workingSet = await import("@editor/services/workingSetService");
    post = vi.mocked(api.default.post);
    uploadChunked = vi.mocked(chunked.uploadTemporaryFileInChunks);
    ensureWorkingSetReference = workingSet.ensureWorkingSetReference;
    ensureWorkingSetReferences = workingSet.ensureWorkingSetReferences;
    post.mockReset();
    uploadChunked.mockReset();
    uploadChunked.mockResolvedValue(undefined);
  });

  it("uses a chunked upload id without a second upload request", async () => {
    uploadChunked.mockResolvedValue(99);

    await expect(
      ensureWorkingSetReference(
        source("local-1"),
        new File(["x"], "a.pdf"),
        () => stub(),
      ),
    ).resolves.toBe("storage:99");
    expect(post).not.toHaveBeenCalled();
  });

  it("uses an existing server copy without uploading", async () => {
    const current = stub({
      remoteStorageId: 7,
      remoteSync: { revision: "rev-1", leafId: "local-1" as FileId },
    });

    await expect(
      ensureWorkingSetReference(
        source("local-1"),
        new File(["x"], "a.pdf"),
        () => current,
      ),
    ).resolves.toBe("storage:7");
    expect(post).not.toHaveBeenCalled();
  });

  it("uploads a local file once and reuses the reference", async () => {
    post.mockResolvedValue(response(42));

    await expect(
      ensureWorkingSetReference(
        source("local-1"),
        new File(["x"], "a.pdf"),
        () => stub(),
      ),
    ).resolves.toBe("storage:42");
    await expect(
      ensureWorkingSetReference(
        source("local-1"),
        new File(["x"], "a.pdf"),
        () => stub(),
      ),
    ).resolves.toBe("storage:42");

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toContain("/api/v1/storage/files/temporary");
  });

  it("keeps encrypted files on the upload path", async () => {
    const encrypted = stub({ processedFile: { pages: [], isEncrypted: true } });

    await expect(
      ensureWorkingSetReference(
        source("local-1"),
        new File(["x"], "a.pdf"),
        () => encrypted,
      ),
    ).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it("returns no references when any input cannot be prepared", async () => {
    post
      .mockResolvedValueOnce(response(1))
      .mockRejectedValueOnce(new Error("quota"));

    const result = await ensureWorkingSetReferences(
      [source("local-1"), source("local-2")],
      [new File(["x"], "a.pdf"), new File(["y"], "b.pdf")],
      (id) => stub({ id, originalFileId: id }),
    );

    expect(result.size).toBe(0);
  });
});
