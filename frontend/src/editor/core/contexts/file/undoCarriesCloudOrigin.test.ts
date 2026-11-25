import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CloudOrigin, FileId } from "@editor/types/file";
import type { StirlingFileStub } from "@editor/types/fileContext";

const updateFileMetadata = vi.fn().mockResolvedValue(true);

vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata },
}));

const { undoConsumeFiles, withLatestCloudOrigins } =
  await import("@editor/contexts/file/fileActions");

const origin = (itemId: string, eTag: string): CloudOrigin => ({
  provider: "onedrive",
  accountId: 2,
  driveId: "drive-1",
  itemId,
  parentId: "folder-1",
  name: `${itemId}.pdf`,
  eTag,
  webUrl: null,
  protected: false,
});

const stub = (id: string, cloudOrigin?: CloudOrigin) =>
  ({
    id: id as FileId,
    name: `${id}.pdf`,
    isLeaf: false,
    ...(cloudOrigin ? { cloudOrigin } : {}),
  }) as StirlingFileStub;

describe("withLatestCloudOrigins", () => {
  it("takes the newer OneDrive version from the same item", () => {
    const [restored] = withLatestCloudOrigins(
      [stub("v1", origin("item-1", "e1"))],
      [stub("v2", origin("item-1", "e2"))],
    );
    expect(restored.cloudOrigin?.eTag).toBe("e2");
  });

  it("ignores links to other OneDrive items", () => {
    const [restored] = withLatestCloudOrigins(
      [stub("v1", origin("item-1", "e1"))],
      [stub("v2", origin("item-2", "e9"))],
    );
    expect(restored.cloudOrigin?.eTag).toBe("e1");
  });

  it("never links a file that had no OneDrive origin", () => {
    const [restored] = withLatestCloudOrigins(
      [stub("v1")],
      [stub("v2", origin("item-1", "e2"))],
    );
    expect(restored.cloudOrigin).toBeUndefined();
  });
});

describe("undoConsumeFiles", () => {
  beforeEach(() => updateFileMetadata.mockClear());

  it("restores a saved file with the OneDrive version its undone edit saved", async () => {
    const dispatch = vi.fn();
    await undoConsumeFiles(
      [new File(["x"], "v1.pdf")],
      [stub("v1", origin("item-1", "e1"))],
      ["v2" as FileId],
      { current: new Map<FileId, File>() },
      dispatch,
      null,
      [stub("v2", origin("item-1", "e2"))],
    );
    const restored = dispatch.mock.calls[0][0].payload.inputStirlingFileStubs;
    expect(restored[0].cloudOrigin.eTag).toBe("e2");
    expect(updateFileMetadata).toHaveBeenCalledWith("v1", {
      isLeaf: true,
      cloudOrigin: origin("item-1", "e2"),
    });
  });
});
