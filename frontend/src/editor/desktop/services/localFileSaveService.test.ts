// @vitest-environment node
import { describe, expect, test, vi, beforeEach } from "vitest";
import { expectConsole } from "@editor/tests/failOnConsole";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

// A save writes onto the watched path, so the watcher reports our own write as
// an external change. The save must mute the path, and unmute if it failed.

const writeFile = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile }));
// write_locked_file: true when the save went through the held file lock.
const invoke = vi.hoisted(() => vi.fn(async () => false));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

const getDiskFileState = vi.hoisted(() =>
  vi.fn(async () => ({
    availability: "present" as const,
    size: 3,
    modifiedMs: 9000,
  })),
);
vi.mock("@editor/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState,
  readFileFromDisk: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
}));
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata: vi.fn(async () => true) },
}));

import { saveToLocalPath } from "@editor/services/localFileSaveService";
import {
  syncLinkedFileFromDisk,
  __resetSelfWrites,
} from "@editor/services/diskFileSync";

const PATH = "C:/docs/report.pdf";
const bytes = new Uint8Array([1, 2, 3]);

// Baseline deliberately stale, so anything but a mute reports "updated".
const linked = () =>
  ({
    id: "f1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 3,
    lastModified: 0,
    localFilePath: PATH,
    diskSyncedSize: 1,
    diskSyncedModifiedMs: 1,
  }) as StirlingFileStub;

beforeEach(() => {
  __resetSelfWrites();
  vi.clearAllMocks();
  writeFile.mockResolvedValue(undefined);
  invoke.mockResolvedValue(false);
});

describe("saveToLocalPath", () => {
  test("writes the bytes straight to the path it was given", async () => {
    const file = new File([bytes], "report.pdf");
    // jsdom mangles binary Blob parts, so compare against what this very Blob
    // yields: what matters is that the save passes it through untouched.
    const expected = new Uint8Array(await file.arrayBuffer());

    const result = await saveToLocalPath(file, PATH);
    expect(result).toEqual({ success: true });
    expect(writeFile).toHaveBeenCalledWith(PATH, expected);
  });

  test("saves an open, locked file through its lock instead", async () => {
    invoke.mockResolvedValueOnce(true);
    const file = new File([bytes], "report.pdf");
    const expected = new Uint8Array(await file.arrayBuffer());

    const result = await saveToLocalPath(
      file,
      "C:/Akten/Schröder Gläubiger.pdf",
    );
    expect(result).toEqual({ success: true });
    expect(invoke).toHaveBeenCalledWith("write_locked_file", expected, {
      headers: { path: encodeURIComponent("C:/Akten/Schröder Gläubiger.pdf") },
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  test("mutes the path so the watcher cannot re-read our own write", async () => {
    await saveToLocalPath(new File([bytes], "report.pdf"), PATH);
    const outcome = await syncLinkedFileFromDisk(linked());
    expect(outcome.status).toBe("unchanged");
    // Muted before the stat, so a half-written file is never even read.
    expect(getDiskFileState).not.toHaveBeenCalled();
  });

  test("unmutes when the write failed, so a real change is not missed", async () => {
    expectConsole.error(/Failed to save/);
    writeFile.mockRejectedValueOnce(new Error("EACCES"));

    const result = await saveToLocalPath(new File([bytes], "report.pdf"), PATH);
    expect(result.success).toBe(false);

    const outcome = await syncLinkedFileFromDisk(linked());
    expect(outcome.status).toBe("updated");
  });
});
