import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  stat: vi.fn(),
  lstat: vi.fn(),
  invoke: vi.fn(),
  diskState: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  mounted: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ ...mocks, mkdir: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@app/services/desktopFileLink", () => ({
  getDiskFileState: mocks.diskState,
}));
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
  restoreProcessingFile,
  removeProcessingOutput,
  readProcessingOriginal,
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
  mocks.lstat.mockResolvedValue({
    isDirectory: true,
    isFile: true,
    isSymlink: false,
  });
  mocks.diskState.mockImplementation(async (path) =>
    path.includes("/.stirling/")
      ? { availability: "gone" }
      : { availability: "present", size: 10, modifiedMs: 1000 },
  );
  mocks.invoke.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.rename.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.mounted.mockResolvedValue(true);
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
  expect(mocks.writeFile).toHaveBeenCalledBefore(mocks.invoke);
  expect(mocks.invoke).toHaveBeenCalledWith("publish_processing_file", {
    temporary: mocks.writeFile.mock.calls[0][0],
    path: "/downloads/.stirling/a.pdf",
  });
  expect(mocks.rename).not.toHaveBeenCalled();
});

test("an existing original is reused without writing another copy", async () => {
  mocks.diskState.mockResolvedValue({
    availability: "present",
    size: 10,
    modifiedMs: 1000,
  });
  mocks.stat.mockResolvedValue({ isFile: true });
  expect(
    await archiveProcessingInput("/downloads", new File(["later"], "a.pdf")),
  ).toBe("/downloads/.stirling/a.pdf");
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

test("changed content cannot overwrite an existing original", async () => {
  mocks.diskState.mockResolvedValue({
    availability: "present",
    size: 10,
    modifiedMs: 1000,
  });
  mocks.stat.mockResolvedValue({
    isFile: true,
    size: 10,
    mtime: new Date(1000),
  });
  const file = new File(["new document"], "a.pdf");
  vi.spyOn(file, "arrayBuffer").mockResolvedValue(
    new TextEncoder().encode("new document").buffer,
  );

  expect(await archiveProcessingInput("/downloads", file)).toBe(
    "/downloads/.stirling/a.pdf",
  );
  expect(mocks.writeFile).not.toHaveBeenCalled();
  expect(mocks.rename).not.toHaveBeenCalled();
});

test("an unreadable original blocks processing instead of replacing the backup", async () => {
  mocks.diskState.mockResolvedValue({
    availability: "present",
    size: 10,
    modifiedMs: 1000,
  });
  mocks.lstat
    .mockResolvedValueOnce({ isDirectory: true })
    .mockRejectedValueOnce(new Error("Permission denied"));

  await expect(
    archiveProcessingInput("/downloads", new File(["new"], "a.pdf")),
  ).rejects.toThrow("Permission denied");

  expect(mocks.writeFile).not.toHaveBeenCalled();
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
  mocks.invoke.mockRejectedValueOnce(new Error("File exists"));
  await expect(
    archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
  ).rejects.toThrow("File exists");
  expect(mocks.rename).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalledWith("/downloads/.stirling/a.pdf");
});

test("concurrent archive requests publish only the first original", async () => {
  const published = new Set<string>();
  mocks.diskState.mockImplementation(async (path) =>
    published.has(path)
      ? { availability: "present", size: 10, modifiedMs: 1000 }
      : { availability: "gone" },
  );
  mocks.stat.mockResolvedValue({ isFile: true });
  mocks.invoke.mockImplementation(async (_command, { path }) => {
    published.add(path);
  });
  await Promise.all([
    archiveProcessingInput("/downloads", new File(["first"], "a.pdf")),
    archiveProcessingInput("/downloads", new File(["later"], "a.pdf")),
  ]);
  expect(mocks.writeFile).toHaveBeenCalledOnce();
  expect(mocks.invoke).toHaveBeenCalledOnce();
});

test("failed publication removes staging without leaving an accepted backup", async () => {
  mocks.invoke.mockRejectedValueOnce(new Error("Publish failed"));
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

test("restoring a deleted input publishes complete bytes without replacing a returning file", async () => {
  mocks.diskState.mockResolvedValue({ availability: "gone" });
  await restoreProcessingFile(input.path, new File(["original"], input.name));
  expect(mocks.invoke).toHaveBeenCalledWith("publish_processing_file", {
    temporary: mocks.writeFile.mock.calls[0][0],
    path: input.path,
  });
  expect(mocks.writeFile).toHaveBeenCalledBefore(mocks.invoke);
  expect(mocks.rename).not.toHaveBeenCalled();
});

test("a returning input makes restore fail without consuming the original", async () => {
  mocks.diskState.mockResolvedValue({ availability: "gone" });
  mocks.invoke.mockRejectedValueOnce(new Error("File exists"));
  await expect(
    restoreProcessingFile(input.path, new File(["original"], input.name)),
  ).rejects.toThrow("File exists");
  expect(mocks.remove).toHaveBeenCalledWith(mocks.writeFile.mock.calls[0][0]);
  expect(mocks.remove).not.toHaveBeenCalledWith(input.path);
});

test.each(["permission", "offline", "unknown"])(
  "an unavailable input (%s) is never treated as deleted",
  async (reason) => {
    mocks.diskState.mockResolvedValue({ availability: "unavailable", reason });
    await expect(
      restoreProcessingFile(input.path, new File(["original"], input.name)),
    ).rejects.toThrow("Cannot access processing file");
    expect(mocks.writeFile).not.toHaveBeenCalled();
  },
);

test("restoring an edited input checks its current version", async () => {
  mocks.diskState.mockResolvedValue({
    availability: "present",
    size: 20,
    modifiedMs: 2000,
  });
  mocks.stat.mockResolvedValue({ size: 20, mtime: new Date(2000) });
  await restoreProcessingFile(input.path, new File(["original"], input.name));
  expect(mocks.rename).toHaveBeenCalledWith(expect.any(String), input.path);
  expect(mocks.invoke).not.toHaveBeenCalled();
});

test("an already deleted split output does not block a retry", async () => {
  mocks.diskState.mockResolvedValue({ availability: "gone" });
  mocks.remove.mockRejectedValue(new Error("File not found"));
  await expect(removeProcessingOutput(input)).resolves.toBeUndefined();
  expect(mocks.remove).not.toHaveBeenCalled();
});

test("an output that disappears during removal also counts as cleaned up", async () => {
  mocks.diskState
    .mockResolvedValueOnce({
      availability: "present",
      size: 10,
      modifiedMs: 1000,
    })
    .mockResolvedValue({ availability: "gone" });
  mocks.remove.mockRejectedValueOnce(new Error("File not found"));
  await expect(removeProcessingOutput(input)).resolves.toBeUndefined();
  expect(mocks.remove).toHaveBeenCalledWith(input.path);
});

test("split output permission errors remain retryable failures", async () => {
  mocks.remove.mockRejectedValueOnce(new Error("Permission denied"));
  await expect(removeProcessingOutput(input)).rejects.toThrow(
    "Permission denied",
  );
});

test("an edited split output is not deleted", async () => {
  mocks.diskState.mockResolvedValue({
    availability: "present",
    size: 11,
    modifiedMs: 2000,
  });
  await expect(removeProcessingOutput(input)).rejects.toThrow(
    "changed during processing",
  );
  expect(mocks.remove).not.toHaveBeenCalled();
});

test.each(["archive", "backup"])(
  "a linked %s is never accepted as an original",
  async (target) => {
    mocks.diskState.mockResolvedValue({
      availability: "present",
      size: 10,
      modifiedMs: 1000,
    });
    if (target === "backup")
      mocks.lstat.mockResolvedValueOnce({ isDirectory: true });
    mocks.lstat.mockResolvedValue({
      isDirectory: true,
      isFile: true,
      isSymlink: true,
    });
    await expect(
      archiveProcessingInput("/downloads", new File(["input"], "a.pdf")),
    ).rejects.toThrow();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  },
);

test("restoring refuses an original replaced by a symbolic link", async () => {
  mocks.lstat
    .mockResolvedValueOnce({ isDirectory: true })
    .mockResolvedValueOnce({ isFile: true, isSymlink: true });
  await expect(
    readProcessingOriginal("/downloads/.stirling/a.pdf"),
  ).rejects.toThrow("not a regular archived file");
});
