import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import type { FolderId } from "@app/types/folder";

const getStirlingFile = vi.fn();
const updateFileMetadata = vi.fn();

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: (...args: unknown[]) => getStirlingFile(...args),
    updateFileMetadata: (...args: unknown[]) => updateFileMetadata(...args),
  },
}));

const { copyNameFor, duplicateStoredFile } =
  await import("@app/utils/duplicateFile");

/**
 * A duplicate is byte-identical to its source, so everything derived from those
 * bytes (classification labels, thumbnail) and its place in the library (folder)
 * is inherited rather than re-derived. These lock that contract.
 */

const stub = (extra: Partial<StirlingFileStub> = {}): StirlingFileStub =>
  ({
    id: "src-id" as FileId,
    name: "report.pdf",
    size: 10,
    type: "application/pdf",
    lastModified: 1,
    ...extra,
  }) as StirlingFileStub;

const asStirlingFile = (name: string): StirlingFile =>
  Object.assign(new File(["%PDF-1.7"], name, { type: "application/pdf" }), {
    fileId: "new-id" as FileId,
    quickKey: "k",
  }) as StirlingFile;

type AddFilesOptions = {
  selectFiles?: boolean;
  skipWorkspaceDispatch?: boolean;
  autoUnzip?: boolean;
  skipUploadTracking?: boolean;
};
const addFiles = vi.fn<
  (files: File[], options: AddFilesOptions) => Promise<StirlingFile[]>
>(async () => [asStirlingFile("report (copy).pdf")]);

beforeEach(() => {
  vi.clearAllMocks();
  getStirlingFile.mockResolvedValue(asStirlingFile("report.pdf"));
  updateFileMetadata.mockResolvedValue(true);
  addFiles.mockResolvedValue([asStirlingFile("report (copy).pdf")]);
});

describe("copyNameFor", () => {
  it("keeps the extension and counts up until the name is free", () => {
    expect(copyNameFor("report.pdf", [])).toBe("report (copy).pdf");
    expect(copyNameFor("report.pdf", ["report (copy).pdf"])).toBe(
      "report (copy 2).pdf",
    );
    expect(
      copyNameFor("report.pdf", ["report (copy).pdf", "report (copy 2).pdf"]),
    ).toBe("report (copy 3).pdf");
  });

  it("handles a name with no extension", () => {
    expect(copyNameFor("scan", [])).toBe("scan (copy)");
  });
});

describe("duplicateStoredFile", () => {
  it("inherits labels, folder and a persisted thumbnail", async () => {
    const id = await duplicateStoredFile(
      stub({
        classificationLabels: ["invoice"],
        folderId: "folder-1" as FolderId,
        thumbnailUrl: "data:image/png;base64,AAA",
      }),
      [],
      addFiles,
    );

    expect(id).toBe("new-id");
    const [, updates] = updateFileMetadata.mock.calls[0];
    expect(updates.classificationLabels).toEqual(["invoice"]);
    expect(updates.folderId).toBe("folder-1");
    expect(updates.thumbnail).toBe("data:image/png;base64,AAA");
    expect(updates.thumbnailStoredAt).toEqual(expect.any(Number));
  });

  it("drops a blob: thumbnail - it would be dead on the next load", async () => {
    await duplicateStoredFile(
      stub({ classificationLabels: ["invoice"], thumbnailUrl: "blob:abc" }),
      [],
      addFiles,
    );

    const [, updates] = updateFileMetadata.mock.calls[0];
    expect(updates).not.toHaveProperty("thumbnail");
  });

  it("writes nothing when the source has no derived metadata", async () => {
    await duplicateStoredFile(stub(), [], addFiles);

    expect(updateFileMetadata).not.toHaveBeenCalled();
  });

  it("copies the library entry without touching the workbench or metrics", async () => {
    await duplicateStoredFile(stub(), ["report (copy).pdf"], addFiles);

    const [files, options] = addFiles.mock.calls[0];
    expect(files[0].name).toBe("report (copy 2).pdf");
    expect(options).toMatchObject({
      selectFiles: false,
      skipWorkspaceDispatch: true,
      autoUnzip: false,
      skipUploadTracking: true,
    });
  });

  it("returns null when the source bytes are gone", async () => {
    getStirlingFile.mockResolvedValue(null);

    expect(await duplicateStoredFile(stub(), [], addFiles)).toBeNull();
    expect(addFiles).not.toHaveBeenCalled();
  });
});
