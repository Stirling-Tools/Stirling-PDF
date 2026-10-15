import { beforeEach, describe, expect, it, vi } from "vitest";
import { renameStoredFile } from "@app/services/renameStoredFile";
import {
  getLastViewedPage,
  setLastViewedPage,
} from "@app/services/lastViewedPageStore";
import type { FileId } from "@app/types/file";

const updateFileMetadata = vi.hoisted(() => vi.fn());
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata },
}));

const stub = {
  id: "file-1" as FileId,
  name: "report.pdf",
  size: 2048,
  lastModified: 1700000000000,
};
const OLD_KEY = "report.pdf|2048|1700000000000";
const NEW_KEY = "final.pdf|2048|1700000000000";

beforeEach(() => {
  localStorage.clear();
  updateFileMetadata.mockReset();
});

describe("renameStoredFile", () => {
  it("carries the last viewed page over to the new name", async () => {
    updateFileMetadata.mockResolvedValue(true);
    setLastViewedPage(OLD_KEY, 6);
    const updateStub = vi.fn();

    await expect(renameStoredFile(stub, "final.pdf", updateStub)).resolves.toBe(
      true,
    );

    expect(getLastViewedPage(OLD_KEY)).toBeNull();
    expect(getLastViewedPage(NEW_KEY)).toBe(6);
    expect(updateStub).toHaveBeenCalledWith(stub.id, {
      name: "final.pdf",
      quickKey: NEW_KEY,
    });
  });

  it("leaves the page where it was when storage refuses the rename", async () => {
    updateFileMetadata.mockResolvedValue(false);
    setLastViewedPage(OLD_KEY, 6);
    const updateStub = vi.fn();

    await expect(renameStoredFile(stub, "final.pdf", updateStub)).resolves.toBe(
      false,
    );

    expect(getLastViewedPage(OLD_KEY)).toBe(6);
    expect(updateStub).not.toHaveBeenCalled();
  });
});
