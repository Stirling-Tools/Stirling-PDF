import { describe, expect, it, vi } from "vitest";
import { getDropzoneFiles } from "@app/utils/getDropzoneFiles";

function dropEvent(items: object[], files: File[] = []) {
  return Object.assign(new Event("drop"), {
    dataTransfer: { items, files },
  });
}

describe("getDropzoneFiles", () => {
  it("captures every file while the drop event can still read the data store", async () => {
    const files = [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")];
    const items = files.map((file) => ({
      kind: "file",
      getAsFile: vi.fn(() => file),
    }));
    const result = getDropzoneFiles(dropEvent(items));
    for (const item of items) {
      item.getAsFile.mockImplementation(() => {
        throw new Error("The drop event has ended");
      });
    }
    await expect(result).resolves.toEqual(files);
  });

  it("reports drag metadata without trying to read files before the drop", async () => {
    const getAsFile = vi.fn();
    const fileItem = { kind: "file", type: "application/pdf", getAsFile };
    const event = Object.assign(new Event("dragenter"), {
      dataTransfer: { items: [fileItem, { kind: "string" }] },
    });
    await expect(getDropzoneFiles(event)).resolves.toEqual([fileItem]);
    expect(getAsFile).not.toHaveBeenCalled();
  });

  it("reads nested directories through every reader batch", async () => {
    const first = new File(["a"], "a.pdf");
    const nested = new File(["b"], "b.pdf");
    const last = new File(["c"], "c.pdf");
    const fileEntry = (file: File) => ({
      isFile: true,
      file: (resolve: (file: File) => void) => resolve(file),
    });
    const directory = (batches: object[][]) => ({
      isDirectory: true,
      createReader: () => ({
        readEntries: (resolve: (entries: object[]) => void) =>
          resolve(batches.shift() ?? []),
      }),
    });
    const root = directory([
      [fileEntry(first), directory([[fileEntry(nested)]])],
      [fileEntry(last)],
    ]);
    const getAsFile = vi.fn();
    await expect(
      getDropzoneFiles(
        dropEvent([{ kind: "file", webkitGetAsEntry: () => root, getAsFile }]),
      ),
    ).resolves.toEqual([first, nested, last]);
    expect(getAsFile).not.toHaveBeenCalled();
  });

  it("accepts FileList-only drops and excludes system thumbnail files", async () => {
    const file = new File(["PDF"], "a.pdf");
    await expect(
      getDropzoneFiles(
        dropEvent(
          [],
          [file, new File([], "Thumbs.db"), new File([], ".DS_Store")],
        ),
      ),
    ).resolves.toEqual([file]);
  });

  it("keeps the input-file chooser working without file-system handles", async () => {
    const file = new File(["PDF"], "a.pdf");
    const event = new Event("change");
    Object.defineProperty(event, "target", { value: { files: [file] } });
    await expect(getDropzoneFiles(event)).resolves.toEqual([file]);
  });
});
