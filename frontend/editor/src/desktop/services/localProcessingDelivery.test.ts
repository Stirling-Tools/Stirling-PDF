import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  stat: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  exists: vi.fn(),
  mounted: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ ...mocks, mkdir: vi.fn() }));
vi.mock("@app/services/localFolderContents", () => ({
  readDiskFile: vi.fn(),
  writeDiskFile: vi.fn(),
  isWithinMount: mocks.mounted,
}));
vi.mock("@app/services/diskFileSync", () => ({
  beginSelfWrite: vi.fn(),
  endSelfWrite: vi.fn(),
}));
import {
  replaceProcessingFile,
  sameProcessingFile,
  archiveProcessingInput,
} from "@app/services/localProcessingDelivery";

const input = {
  path: "/downloads/a.pdf",
  name: "a.pdf",
  sizeBytes: 10,
  lastModified: 1000,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.stat.mockResolvedValue({ size: 10, mtime: new Date(1000) });
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.rename.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.mounted.mockResolvedValue(true);
  mocks.exists.mockResolvedValue(false);
  const pending = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (name: string, callback: () => Promise<unknown>) => {
        const next = (pending.get(name) ?? Promise.resolve())
          .catch(() => {})
          .then(callback);
        pending.set(name, next);
        return next;
      },
    },
  });
});

test("the original is stored directly under .stirling with its own filename", async () => {
  const file = new File(["original"], "a.pdf");
  vi.spyOn(file, "arrayBuffer").mockResolvedValue(
    new TextEncoder().encode("original").buffer,
  );
  expect(await archiveProcessingInput("/downloads", file)).toBe(
    "/downloads/.stirling/a.pdf",
  );
  expect(mocks.writeFile).toHaveBeenCalledWith(
    expect.stringContaining("/downloads/.stirling/.original-"),
    expect.any(Uint8Array),
    { createNew: true },
  );
  expect(Array.from(mocks.writeFile.mock.calls[0][1])).toEqual(
    Array.from(new TextEncoder().encode("original")),
  );
  expect(mocks.writeFile).toHaveBeenCalledBefore(mocks.rename);
  expect(mocks.rename).toHaveBeenCalledWith(
    mocks.writeFile.mock.calls[0][0],
    "/downloads/.stirling/a.pdf",
  );
});

test("an existing original is reused without writing another copy", async () => {
  mocks.exists.mockResolvedValue(true);
  mocks.stat.mockResolvedValue({ isFile: true });
  expect(
    await archiveProcessingInput("/downloads", new File(["later"], "a.pdf")),
  ).toBe("/downloads/.stirling/a.pdf");
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

test("a new same-name document replaces the backup only after staging succeeds", async () => {
  mocks.exists.mockResolvedValue(true);
  mocks.stat.mockResolvedValue({
    isFile: true,
    size: 10,
    mtime: new Date(1000),
  });
  const file = new File(["new document"], "a.pdf");
  vi.spyOn(file, "arrayBuffer").mockResolvedValue(
    new TextEncoder().encode("new document").buffer,
  );

  await archiveProcessingInput("/downloads", file, true);

  expect(Array.from(mocks.writeFile.mock.calls[0][1])).toEqual(
    Array.from(new TextEncoder().encode("new document")),
  );
  expect(mocks.writeFile).toHaveBeenCalledBefore(mocks.rename);
  expect(mocks.rename).toHaveBeenCalledWith(
    mocks.writeFile.mock.calls[0][0],
    "/downloads/.stirling/a.pdf",
  );
});

test("failed backup refresh preserves the previous backup", async () => {
  mocks.exists.mockResolvedValue(true);
  mocks.stat.mockResolvedValue({
    isFile: true,
    size: 10,
    mtime: new Date(1000),
  });
  mocks.writeFile.mockRejectedValueOnce(new Error("Disk full"));

  await expect(
    archiveProcessingInput("/downloads", new File(["new"], "a.pdf"), true),
  ).rejects.toThrow("Disk full");

  expect(mocks.rename).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalledWith("/downloads/.stirling/a.pdf");
});

test("an incomplete backup is removed so a retry can archive the input", async () => {
  mocks.writeFile.mockRejectedValueOnce(new Error("Disk full"));
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("Disk full");
  expect(mocks.rename).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalledWith(mocks.writeFile.mock.calls[0][0]);
  expect(mocks.remove).not.toHaveBeenCalledWith("/downloads/.stirling/a.pdf");
});

test("a backup created concurrently is never removed", async () => {
  mocks.exists.mockResolvedValueOnce(false).mockResolvedValue(true);
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("created while archiving");
  expect(mocks.rename).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalledWith("/downloads/.stirling/a.pdf");
});

test("concurrent archive requests publish only the first original", async () => {
  const published = new Set<string>();
  mocks.exists.mockImplementation(async (path) => published.has(path));
  mocks.stat.mockResolvedValue({ isFile: true });
  mocks.rename.mockImplementation(async (_temporary, path) => {
    published.add(path);
  });
  await Promise.all([
    archiveProcessingInput("/downloads", new File(["first"], "a.pdf")),
    archiveProcessingInput("/downloads", new File(["later"], "a.pdf")),
  ]);
  expect(mocks.writeFile).toHaveBeenCalledOnce();
  expect(mocks.rename).toHaveBeenCalledOnce();
});

test("failed publication removes staging without leaving an accepted backup", async () => {
  mocks.rename.mockRejectedValueOnce(new Error("Publish failed"));
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("Publish failed");
  expect(mocks.remove).toHaveBeenCalledWith(mocks.writeFile.mock.calls[0][0]);
  expect(mocks.remove).not.toHaveBeenCalledWith("/downloads/.stirling/a.pdf");
});

test("unmounted folders cannot create backups", async () => {
  mocks.mounted.mockResolvedValue(false);
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("no longer mounted");
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

test("failed staging leaves the input intact", async () => {
  mocks.writeFile.mockRejectedValueOnce(new Error("Disk full"));
  await expect(
    replaceProcessingFile(input, new File(["new"], "a.pdf")),
  ).rejects.toThrow("Disk full");
  expect(mocks.rename).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalledWith(input.path);
});

test("an edit made while staging prevents replacement", async () => {
  mocks.stat
    .mockResolvedValueOnce({ size: 10, mtime: new Date(1000) })
    .mockResolvedValue({ size: 11, mtime: new Date(2000) });
  await expect(
    replaceProcessingFile(input, new File(["new"], "a.pdf")),
  ).rejects.toThrow("changed during processing");
  expect(mocks.rename).not.toHaveBeenCalled();
});

test("successful delivery replaces the source only after staging and rechecking", async () => {
  await replaceProcessingFile(input, new File(["new"], "a.pdf"));
  expect(mocks.writeFile).toHaveBeenCalledBefore(mocks.rename);
  expect(mocks.rename).toHaveBeenCalledWith(
    expect.stringContaining("/downloads/a.pdf."),
    input.path,
  );
  expect(mocks.stat).toHaveBeenCalledTimes(3);
});

test("Windows output paths match the directory listing's separator and casing", () => {
  expect(
    sameProcessingFile(
      { ...input, path: "C:\\Downloads/result.pdf" },
      { ...input, path: "c:\\downloads\\result.pdf" },
    ),
  ).toBe(true);
});
