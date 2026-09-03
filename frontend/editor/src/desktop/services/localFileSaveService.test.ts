import { describe, expect, test, vi, beforeEach } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// A save writes onto the watched path, so the watcher reports our own write as
// an external change. The save must mute the path, and unmute if it failed.

const writeFile = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile }));

const getDiskFileState = vi.hoisted(() =>
  vi.fn(async () => ({ exists: true, size: 3, modifiedMs: 9000 })),
);
vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState,
  pathExistsOnDisk: vi.fn(async () => true),
  readFileFromDisk: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata: vi.fn(async () => true) },
}));

import { saveToLocalPath } from "@app/services/localFileSaveService";
import {
  syncLinkedFileFromDisk,
  __resetSelfWrites,
} from "@app/services/diskFileSync";

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
