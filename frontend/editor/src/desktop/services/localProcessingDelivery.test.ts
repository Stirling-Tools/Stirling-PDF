import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  stat: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  exists: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  close: vi.fn(),
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
  mocks.open.mockResolvedValue({ write: mocks.write, close: mocks.close });
});

test("the original is stored directly under .stirling with its own filename", async () => {
  const file = new File(["original"], "a.pdf");
  vi.spyOn(file, "arrayBuffer").mockResolvedValue(
    new TextEncoder().encode("original").buffer,
  );
  expect(await archiveProcessingInput("/downloads", file)).toBe(
    "/downloads/.stirling/a.pdf",
  );
  expect(mocks.open).toHaveBeenCalledWith("/downloads/.stirling/a.pdf", {
    write: true,
    createNew: true,
  });
  expect(mocks.write).toHaveBeenCalledOnce();
  expect(Array.from(mocks.write.mock.calls[0][0])).toEqual(
    Array.from(new TextEncoder().encode("original")),
  );
  expect(mocks.close).toHaveBeenCalledOnce();
});

test("an existing original is reused without writing another copy", async () => {
  mocks.exists.mockResolvedValue(true);
  mocks.stat.mockResolvedValue({ isFile: true });
  expect(
    await archiveProcessingInput("/downloads", new File(["later"], "a.pdf")),
  ).toBe("/downloads/.stirling/a.pdf");
  expect(mocks.open).not.toHaveBeenCalled();
});

test("an incomplete backup is removed so a retry can archive the input", async () => {
  mocks.write.mockRejectedValueOnce(new Error("Disk full"));
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("Disk full");
  expect(mocks.close).toHaveBeenCalledBefore(mocks.remove);
  expect(mocks.remove).toHaveBeenCalledWith("/downloads/.stirling/a.pdf");
});

test("a backup created concurrently is never removed", async () => {
  mocks.open.mockRejectedValueOnce(new Error("File exists"));
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("File exists");
  expect(mocks.remove).not.toHaveBeenCalled();
});

test("unmounted folders cannot create backups", async () => {
  mocks.mounted.mockResolvedValue(false);
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("no longer mounted");
  expect(mocks.open).not.toHaveBeenCalled();
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
