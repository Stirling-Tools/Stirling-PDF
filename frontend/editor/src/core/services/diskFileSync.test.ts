import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// The seam is a module-level const, so each behaviour is exercised by re-importing
// the module under a fresh mock rather than by mutating a flag.
const diskState = vi.hoisted(() => ({
  supported: true,
  state: { exists: true, size: 100, modifiedMs: 5000 },
  bytes: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer | null,
}));

vi.mock("@app/services/desktopFileLink", () => ({
  get desktopFileLinkingSupported() {
    return diskState.supported;
  },
  getDiskFileState: vi.fn(async () => diskState.state),
  pathExistsOnDisk: vi.fn(async () => diskState.state.exists),
  readFileFromDisk: vi.fn(async () => diskState.bytes),
}));

const updateFileMetadata = vi.hoisted(() => vi.fn(async () => true));
const deleteStirlingFile = vi.hoisted(() => vi.fn(async () => undefined));
const getStirlingFile = vi.hoisted(() =>
  vi.fn(async () => new File([new Uint8Array([9])], "report.pdf")),
);

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata, deleteStirlingFile, getStirlingFile },
}));

const downloadFileWithPolicy = vi.hoisted(() =>
  vi.fn(
    async (_request: Record<string, unknown>) =>
      ({ savedPath: "C:/elsewhere/report.pdf" }) as any,
  ),
);
vi.mock("@app/services/exportWithPolicy", () => ({ downloadFileWithPolicy }));

const alertMock = vi.hoisted(() => vi.fn());
vi.mock("@app/components/toast", () => ({ alert: alertMock }));

import {
  syncLinkedFileFromDisk,
  hasDiskChanged,
  diskLinkState,
  detachedFields,
  loadDiskVersion,
  persistDiskUpdate,
  refreshDiskBaselineAfterSave,
  saveOrphanAsCopy,
  notifyFileVanished,
  notifyDiskConflict,
  notifyDiskReloaded,
  notifyOpenFileDeleted,
} from "@app/services/diskFileSync";

function stub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: "file-1" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 100,
    lastModified: 5000,
    isLeaf: true,
    originalFileId: "file-1",
    versionNumber: 1,
    localFilePath: "C:/docs/report.pdf",
    diskSyncedSize: 100,
    diskSyncedModifiedMs: 5000,
    ...overrides,
  } as StirlingFileStub;
}

beforeEach(() => {
  diskState.supported = true;
  diskState.state = { exists: true, size: 100, modifiedMs: 5000 };
  diskState.bytes = new Uint8Array([1, 2, 3]).buffer;
  vi.clearAllMocks();
  downloadFileWithPolicy.mockResolvedValue({
    savedPath: "C:/elsewhere/report.pdf",
  });
  getStirlingFile.mockResolvedValue(
    new File([new Uint8Array([9])], "report.pdf"),
  );
});

afterEach(() => vi.clearAllMocks());

describe("hasDiskChanged", () => {
  it("treats a record with no baseline as changed so it re-reads once", () => {
    expect(
      hasDiskChanged(
        { diskSyncedSize: undefined, diskSyncedModifiedMs: undefined },
        { exists: true, size: 100, modifiedMs: 5000 },
      ),
    ).toBe(true);
  });

  it("is unchanged when size and mtime both match", () => {
    expect(
      hasDiskChanged(
        { diskSyncedSize: 100, diskSyncedModifiedMs: 5000 },
        { exists: true, size: 100, modifiedMs: 5000 },
      ),
    ).toBe(false);
  });

  it("spots an edit that changed the size", () => {
    expect(
      hasDiskChanged(
        { diskSyncedSize: 100, diskSyncedModifiedMs: 5000 },
        { exists: true, size: 240, modifiedMs: 5000 },
      ),
    ).toBe(true);
  });

  it("spots an edit that kept the size but moved the mtime", () => {
    expect(
      hasDiskChanged(
        { diskSyncedSize: 100, diskSyncedModifiedMs: 5000 },
        { exists: true, size: 100, modifiedMs: 9999 },
      ),
    ).toBe(true);
  });

  it("falls back to size alone when the platform reports no mtime", () => {
    expect(
      hasDiskChanged(
        { diskSyncedSize: 100, diskSyncedModifiedMs: 5000 },
        { exists: true, size: 100, modifiedMs: 0 },
      ),
    ).toBe(false);
  });
});

describe("syncLinkedFileFromDisk", () => {
  it("ignores files with no disk link", async () => {
    const result = await syncLinkedFileFromDisk(
      stub({ localFilePath: undefined }),
    );
    expect(result.status).toBe("not-linked");
  });

  it("ignores every file when the platform has no disk linking", async () => {
    diskState.supported = false;
    const result = await syncLinkedFileFromDisk(stub());
    expect(result.status).toBe("not-linked");
  });

  it("reports a deleted file as missing", async () => {
    diskState.state = { exists: false, size: 0, modifiedMs: 0 };
    const result = await syncLinkedFileFromDisk(stub());
    expect(result.status).toBe("missing");
  });

  it("leaves an untouched file alone", async () => {
    const result = await syncLinkedFileFromDisk(stub());
    expect(result.status).toBe("unchanged");
  });

  it("reads the live bytes when the file was edited outside the app", async () => {
    diskState.state = { exists: true, size: 3, modifiedMs: 9000 };
    const result = await syncLinkedFileFromDisk(stub());
    expect(result.status).toBe("updated");
    if (result.status !== "updated") throw new Error("expected updated");
    expect(result.file.name).toBe("report.pdf");
    expect(await result.file.arrayBuffer()).toEqual(
      new Uint8Array([1, 2, 3]).buffer,
    );
    expect(result.file.lastModified).toBe(9000);
  });

  it("keeps unsaved in-app edits instead of overwriting them from disk", async () => {
    diskState.state = { exists: true, size: 3, modifiedMs: 9000 };
    const result = await syncLinkedFileFromDisk(stub({ isDirty: true }));
    expect(result.status).toBe("conflict");
  });

  it("keeps the stored copy when the disk file cannot be read", async () => {
    diskState.state = { exists: true, size: 3, modifiedMs: 9000 };
    diskState.bytes = null;
    const result = await syncLinkedFileFromDisk(stub());
    expect(result.status).toBe("unchanged");
  });

  it("re-reads a legacy record that has no baseline", async () => {
    const result = await syncLinkedFileFromDisk(
      stub({ diskSyncedSize: undefined, diskSyncedModifiedMs: undefined }),
    );
    expect(result.status).toBe("updated");
  });
});

describe("diskLinkState", () => {
  it("is 'none' for a file that never came from disk", () => {
    expect(diskLinkState({})).toBe("none");
  });

  it("is 'linked' while the original is present and agrees", () => {
    expect(diskLinkState({ localFilePath: "C:/docs/report.pdf" })).toBe(
      "linked",
    );
  });

  it("is 'orphaned' once the original is gone", () => {
    // The distinction the UI could not previously draw: this is NOT the same as
    // a file that was never saved, and it must not read like one.
    expect(diskLinkState({ orphanedFilePath: "C:/docs/report.pdf" })).toBe(
      "orphaned",
    );
  });

  it("is 'conflict' while a divergence is unresolved", () => {
    expect(
      diskLinkState({
        localFilePath: "C:/docs/report.pdf",
        diskConflictAt: 1234,
      }),
    ).toBe("conflict");
  });
});

describe("detachedFields", () => {
  it("cuts the link but remembers where it pointed", () => {
    const fields = detachedFields("C:/docs/gone.pdf");
    expect(fields.localFilePath).toBeUndefined();
    expect(fields.diskSyncedSize).toBeUndefined();
    expect(fields.diskSyncedModifiedMs).toBeUndefined();
    expect(fields.diskConflictAt).toBeUndefined();
    // Kept so the badge can go on saying "not on disk" after the toast has gone.
    expect(fields.orphanedFilePath).toBe("C:/docs/gone.pdf");
  });
});

describe("loadDiskVersion", () => {
  it("reads the disk copy so a conflict can be resolved towards it", async () => {
    diskState.state = { exists: true, size: 3, modifiedMs: 9000 };
    const loaded = await loadDiskVersion(stub({ isDirty: true }));
    expect(loaded?.file.name).toBe("report.pdf");
    expect(loaded?.state.modifiedMs).toBe(9000);
  });

  it("gives nothing when the disk file has since gone too", async () => {
    diskState.state = { exists: false, size: 0, modifiedMs: 0 };
    expect(await loadDiskVersion(stub())).toBeNull();
  });
});

describe("persistDiskUpdate", () => {
  it("stores the new bytes, re-baselines, and drops the stale thumbnail", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "report.pdf", {
      type: "application/pdf",
      lastModified: 9000,
    });
    await persistDiskUpdate(
      "file-1" as FileId,
      file,
      { exists: true, size: 3, modifiedMs: 9000 },
      12345,
    );

    expect(updateFileMetadata).toHaveBeenCalledWith(
      "file-1",
      expect.objectContaining({
        data: file,
        size: 3,
        lastModified: 9000,
        quickKey: "report.pdf|3|9000",
        thumbnail: undefined,
        thumbnailStoredAt: undefined,
        diskSyncedSize: 3,
        diskSyncedModifiedMs: 9000,
        // What is on screen is now the disk version, so nothing is unsaved and
        // any earlier divergence is settled.
        isDirty: false,
        diskConflictAt: undefined,
        diskReloadedAt: 12345,
      }),
    );
  });
});

describe("saveOrphanAsCopy", () => {
  it("prompts for a location and re-links the file there", async () => {
    diskState.state = { exists: true, size: 42, modifiedMs: 8000 };
    const saved = await saveOrphanAsCopy(
      stub({ localFilePath: undefined, orphanedFilePath: "C:/docs/gone.pdf" }),
    );

    // No localPath passed, which is what forces the save dialog.
    expect(downloadFileWithPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "report.pdf" }),
    );
    expect(downloadFileWithPolicy.mock.calls[0][0]).not.toHaveProperty(
      "localPath",
    );

    expect(saved?.path).toBe("C:/elsewhere/report.pdf");
    expect(saved?.updates).toMatchObject({
      localFilePath: "C:/elsewhere/report.pdf",
      orphanedFilePath: undefined,
      isDirty: false,
      diskSyncedSize: 42,
      diskSyncedModifiedMs: 8000,
    });
  });

  it("changes nothing when the user cancels the picker", async () => {
    downloadFileWithPolicy.mockResolvedValue({ cancelled: true });
    expect(await saveOrphanAsCopy(stub())).toBeNull();
    expect(updateFileMetadata).not.toHaveBeenCalled();
  });
});

describe("refreshDiskBaselineAfterSave", () => {
  it("re-baselines against the file just written and clears the conflict", async () => {
    diskState.state = { exists: true, size: 512, modifiedMs: 7777 };
    const baseline = await refreshDiskBaselineAfterSave(
      "file-1" as FileId,
      "C:/docs/report.pdf",
    );
    expect(baseline).toEqual({
      diskSyncedSize: 512,
      diskSyncedModifiedMs: 7777,
      // Writing our version out settles the divergence one way.
      diskConflictAt: undefined,
    });
    expect(updateFileMetadata).toHaveBeenCalledWith("file-1", baseline);
  });

  it("stamps nothing when the save did not land on disk", async () => {
    diskState.state = { exists: false, size: 0, modifiedMs: 0 };
    const baseline = await refreshDiskBaselineAfterSave(
      "file-1" as FileId,
      "C:/docs/report.pdf",
    );
    expect(baseline).toBeNull();
    expect(updateFileMetadata).not.toHaveBeenCalled();
  });

  it("does nothing off the desktop app", async () => {
    diskState.supported = false;
    expect(
      await refreshDiskBaselineAfterSave("file-1" as FileId, "/x.pdf"),
    ).toBeNull();
  });
});

describe("user-facing notifications", () => {
  // The toast module is imported lazily, so the alert lands a microtask later.
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("names the file that vanished", async () => {
    notifyFileVanished("report.pdf");
    await flush();
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "warning",
        body: expect.stringContaining("report.pdf"),
      }),
    );
  });

  it("explains that the local version is being kept on a conflict", async () => {
    notifyDiskConflict("report.pdf");
    await flush();
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "warning",
        body: expect.stringContaining("unsaved changes"),
      }),
    );
  });

  it("offers a way out of the conflict instead of only announcing it", async () => {
    const onUseDisk = vi.fn();
    notifyDiskConflict("report.pdf", onUseDisk);
    await flush();
    const toast = alertMock.mock.calls[0][0];
    // An unresolved fork is a decision, so it must not time out on its own.
    expect(toast.isPersistentPopup).toBe(true);
    expect(toast.buttonText).toBeTruthy();
    toast.buttonCallback();
    expect(onUseDisk).toHaveBeenCalled();
  });

  it("tells the user an open file lost its original but is still here", async () => {
    notifyOpenFileDeleted(["report.pdf"]);
    await flush();
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "warning",
        body: expect.stringContaining("still open here"),
      }),
    );
    expect(alertMock.mock.calls[0][0].body).toContain("report.pdf");
  });

  it("warns that saving will ask for a new location, and offers to do it", async () => {
    const onSaveAs = vi.fn();
    notifyOpenFileDeleted(["report.pdf"], onSaveAs);
    await flush();
    const toast = alertMock.mock.calls[0][0];
    // Saying "save it" without saying where makes the file picker read as an error.
    expect(toast.body).toContain("new location");
    expect(toast.isPersistentPopup).toBe(true);
    toast.buttonCallback();
    expect(onSaveAs).toHaveBeenCalled();
  });

  it("counts them instead of listing when several are lost at once", async () => {
    notifyOpenFileDeleted(["a.pdf", "b.pdf", "c.pdf"]);
    await flush();
    expect(alertMock.mock.calls[0][0].body).toContain("3 files");
  });

  it("offers no single-file action when several were lost", async () => {
    notifyOpenFileDeleted(["a.pdf", "b.pdf"], vi.fn());
    await flush();
    expect(alertMock.mock.calls[0][0].buttonText).toBeUndefined();
  });

  it("leaves a trace when an external edit is picked up", async () => {
    notifyDiskReloaded("report.pdf");
    await flush();
    // Neutral, not a warning: nothing went wrong, the user just needs to be able
    // to tell whose version is on screen.
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "neutral",
        body: expect.stringContaining("report.pdf"),
      }),
    );
  });
});
