import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  stat: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ ...mocks, mkdir: vi.fn() }));
vi.mock("@app/services/localFolderContents", () => ({
  readDiskFile: vi.fn(),
  writeDiskFile: vi.fn(),
}));
vi.mock("@app/services/diskFileSync", () => ({
  beginSelfWrite: vi.fn(),
  endSelfWrite: vi.fn(),
}));
import {
  replaceProcessingFile,
  sameProcessingFile,
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
