import { describe, expect, it, vi } from "vitest";
import { getDropzoneFiles } from "@app/utils/getDropzoneFiles";

function dropEvent(items: object[], files: File[] = []) {
  return Object.assign(new Event("drop"), {
    dataTransfer: { items, files },
  });
}

describe("getDropzoneFiles", () => {
  it("keeps readable siblings when a dropped item throws before the data store closes", async () => {
    const file = new File(["PDF"], "Readable.pdf");
    const getAsFile = vi.fn(() => file);
    const onError = vi.fn();
    const result = getDropzoneFiles(
      dropEvent([
        {
          kind: "file",
          getAsFile: () => {
            throw new Error("Access denied");
          },
        },
        { kind: "file", getAsFile },
        { kind: "file", getAsFile: () => null },
      ]),
      onError,
    );
    expect(getAsFile).toHaveBeenCalledOnce();
    getAsFile.mockImplementation(() => {
      throw new Error("Drop ended");
    });
    await expect(result).resolves.toEqual([file]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "Access denied\nCould not read a dropped file.",
      }),
    );
  });

  it("keeps files from later directory batches when an earlier child is unreadable", async () => {
    const first = new File(["first"], "First.pdf");
    const last = new File(["last"], "Last.pdf");
    const readable = (file: File) => ({
      isFile: true,
      file: (resolve: (file: File) => void) => resolve(file),
    });
    const batches = [
      [
        readable(first),
        {
          isFile: true,
          name: "Missing.pdf",
          file: (_resolve: unknown, reject: (error: Error) => void) =>
            reject(new Error("Deleted")),
        },
      ],
      [readable(last)],
      [],
    ];
    const root = {
      isDirectory: true,
      createReader: () => ({
        readEntries: (resolve: (entries: object[]) => void) =>
          resolve(batches.shift() ?? []),
      }),
    };
    const onError = vi.fn();
    await expect(
      getDropzoneFiles(
        dropEvent([{ kind: "file", webkitGetAsEntry: () => root }]),
        onError,
      ),
    ).resolves.toEqual([first, last]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "Missing.pdf: Deleted" }),
    );
  });

  it("rejects an unreadable drop when the caller has no error reporter", async () => {
    await expect(
      getDropzoneFiles(dropEvent([{ kind: "file", getAsFile: () => null }])),
    ).rejects.toThrow("Could not read a dropped file.");
  });

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
