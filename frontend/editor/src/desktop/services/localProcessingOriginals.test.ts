import { beforeEach, expect, test, vi } from "vitest";
import type {
  LocalProcessingFile,
  LocalProcessingFolder,
} from "@app/services/localProcessingFolderStorage";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  lstat: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
  mounted: vi.fn(),
  session: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  files: new Map<string, LocalProcessingFile>(),
  present: new Set<string>(),
}));
vi.mock("@tauri-apps/plugin-fs", () => mocks);
vi.mock("@app/services/localFolderContents", () => ({
  isWithinMount: mocks.mounted,
}));
vi.mock("@app/services/serverAutomationSession", () => ({
  requireAutomationSession: mocks.session,
}));
vi.mock("@app/services/localProcessingFolderStorage", () => ({
  localProcessingFolderStorage: {
    saveFile: mocks.save,
    deleteFile: mocks.delete,
  },
}));
vi.mock("@app/services/localProcessingDelivery", () => ({
  processingPath: (directory: string, name: string) => `${directory}/${name}`,
}));
import { reconcileLocalProcessingOriginals } from "@app/services/localProcessingOriginals";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 8, 1);
const folder: LocalProcessingFolder = {
  id: "desktop:folder",
  sessionKey: "owner",
  directory: "/downloads",
  enabled: false,
  folderId: null,
  name: "Downloads",
  steps: [],
  output: {},
};
const input = {
  path: "/downloads/a.pdf",
  name: "a.pdf",
  sizeBytes: 10,
  lastModified: 1,
};
const original = {
  isFile: true,
  isSymlink: false,
  size: 10,
  mtime: new Date(1),
  birthtime: new Date(1),
};

function entry(): LocalProcessingFile {
  return mocks.files.get("file")!;
}

function scan(now: number) {
  return reconcileLocalProcessingOriginals(
    folder,
    [...mocks.files.values()],
    now,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.files.clear();
  mocks.present.clear();
  mocks.files.set("file", {
    id: "file",
    folderId: folder.id,
    input,
    outputs: [input],
    originalPath: "/downloads/.stirling/a.pdf",
    run: { status: "COMPLETED" },
  });
  mocks.readDir.mockResolvedValue([]);
  mocks.exists.mockImplementation(
    async (path) => path.includes("/.stirling") || mocks.present.has(path),
  );
  mocks.lstat.mockImplementation(async (path) =>
    path.endsWith(".pdf") ? original : { isDirectory: true },
  );
  mocks.mounted.mockResolvedValue(true);
  mocks.save.mockImplementation(async (file) => {
    mocks.files.set(file.id, file);
  });
  mocks.delete.mockImplementation(async (id) => {
    mocks.files.delete(id);
  });
});

test.each([
  "/downloads/.stirling/a.pdf",
  "/downloads/.stirling-originals/old-a.pdf",
])(
  "expires %s seven days after first absence using persisted state",
  async (originalPath) => {
    entry().originalPath = originalPath;
    await scan(START);
    expect(entry().orphanedOriginal?.since).toBe(START);
    await scan(START + 7 * DAY - 1);
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.files.set("file", structuredClone(entry()));

    await scan(START + 7 * DAY);

    expect(mocks.remove).toHaveBeenCalledWith(originalPath);
    expect(mocks.files.size).toBe(0);
  },
);

test("a returned file resets the grace period", async () => {
  await scan(START);
  mocks.readDir.mockResolvedValue([{ name: "a.pdf" }]);
  await scan(START + 6 * DAY);
  expect(entry().orphanedOriginal).toBeUndefined();
  mocks.readDir.mockResolvedValue([]);
  await scan(START + 8 * DAY);
  await scan(START + 14 * DAY);
  expect(mocks.remove).not.toHaveBeenCalled();
  await scan(START + 15 * DAY);
  expect(mocks.remove).toHaveBeenCalledOnce();
});

test("unreadable files in the raw listing still keep their originals", async () => {
  mocks.readDir.mockResolvedValue([{ name: "a.pdf", isFile: true }]);
  mocks.lstat.mockRejectedValue(new Error("Permission denied"));
  await scan(START);
  await scan(START + 100 * DAY);
  expect(mocks.lstat).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(entry().orphanedOriginal).toBeUndefined();
});

test("failed directory listings cannot authorize deletion", async () => {
  await scan(START);
  mocks.readDir.mockRejectedValue(new Error("Drive unavailable"));
  await expect(scan(START + 8 * DAY)).rejects.toThrow("Drive unavailable");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(entry().orphanedOriginal?.since).toBe(START);
});

test("in-flight work keeps its backup and clears expiry", async () => {
  await scan(START);
  entry().run.status = "RUNNING";
  await scan(START + 8 * DAY);
  expect(entry().orphanedOriginal).toBeUndefined();
  expect(mocks.remove).not.toHaveBeenCalled();
});

test("any remaining split output keeps the original", async () => {
  entry().outputs = [
    { ...input, name: "part1.pdf", path: "/downloads/part1.pdf" },
  ];
  mocks.readDir.mockResolvedValue([{ name: "part1.pdf" }]);
  await scan(START);
  await scan(START + 100 * DAY);
  expect(entry().orphanedOriginal).toBeUndefined();
  expect(mocks.remove).not.toHaveBeenCalled();
});

test("a file that returns after listing is rechecked before deletion", async () => {
  await scan(START);
  let checks = 0;
  mocks.exists.mockImplementation(async (path) => {
    if (path.includes("/.stirling")) return true;
    return ++checks > 1;
  });
  await scan(START + 8 * DAY);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(entry().orphanedOriginal).toBeUndefined();
});

test("changed backup contents receive a new grace period", async () => {
  await scan(START);
  mocks.lstat.mockImplementation(async (path) =>
    path.endsWith(".pdf") ? { ...original, size: 20 } : { isDirectory: true },
  );
  await scan(START + 8 * DAY);
  expect(entry().orphanedOriginal?.since).toBe(START + 8 * DAY);
  expect(mocks.remove).not.toHaveBeenCalled();
});

test("failed deletes retain their record and are retried", async () => {
  await scan(START);
  mocks.remove.mockRejectedValueOnce(new Error("File locked"));
  await scan(START + 8 * DAY);
  expect(mocks.files.size).toBe(1);
  expect(mocks.delete).not.toHaveBeenCalled();
  await scan(START + 8 * DAY + 1);
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(mocks.files.size).toBe(0);
});

test("unmounting before expiry prevents removal", async () => {
  await scan(START);
  mocks.mounted.mockResolvedValue(false);
  await scan(START + 8 * DAY);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.files.size).toBe(1);
});

test("signing out before expiry prevents removal", async () => {
  await scan(START);
  mocks.session.mockRejectedValue(new Error("Signed out"));
  await scan(START + 8 * DAY);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.files.size).toBe(1);
});

test("paths outside the two managed archive directories cannot be removed", async () => {
  entry().originalPath = "/downloads/important.pdf";
  await scan(START);
  await scan(START + 100 * DAY);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(entry().orphanedOriginal).toBeUndefined();
});

test("symlinked archive directories are not followed for cleanup", async () => {
  mocks.lstat.mockResolvedValue({ isDirectory: true, isSymlink: true });
  await scan(START);
  await scan(START + 100 * DAY);
  expect(mocks.remove).not.toHaveBeenCalled();
});

test("a backup already deleted on disk releases its stale history", async () => {
  mocks.exists.mockResolvedValue(false);
  await scan(START);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.files.size).toBe(0);
});
