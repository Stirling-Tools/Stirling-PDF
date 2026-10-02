import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FilesPageProvider,
  useFilesPage,
} from "@app/contexts/FilesPageContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FolderId, FolderRecord } from "@app/types/folder";
import type { FileId } from "@app/types/file";

const state = vi.hoisted(() => ({
  revision: 0,
  read: vi.fn<() => Promise<StirlingFileStub[]>>(),
  folders: {
    folders: [] as FolderRecord[],
    foldersById: new Map<FolderId, FolderRecord>(),
    currentFolderId: null,
    setError: vi.fn(),
  },
}));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getAllStirlingFileStubs: () => state.read() },
}));
vi.mock("@app/services/serverStorageUpload", () => ({
  uploadHistoryChain: vi.fn(),
}));
vi.mock("@app/services/folderSyncService", () => ({
  folderSyncService: { bulkMoveFiles: vi.fn() },
}));
vi.mock("@app/services/fileSyncService", () => ({
  reconcileServerFiles: async (files: StirlingFileStub[]) => files,
}));
vi.mock("@app/services/pruneMissingRecentFiles", () => ({
  pruneMissingRecentFiles: async (files: StirlingFileStub[]) => files,
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ moveFilesToFolder: vi.fn() }),
  useIndexedDBRevision: () => state.revision,
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => state.folders,
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileActions: () => ({ actions: { updateStirlingFileStub: vi.fn() } }),
}));
vi.mock("@app/hooks/useDiskLinkReconcile", () => ({
  useDiskLinkReconcile: () => ({
    openFileIdsRef: { current: [] },
    onOpenFilesDetached: vi.fn(),
  }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { storageEnabled: false } }),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ isAnonymous: true }),
}));

const stub = (id: string): StirlingFileStub => ({
  id: id as FileId,
  originalFileId: id,
  name: `${id}.pdf`,
  isLeaf: true,
  versionNumber: 1,
  type: "application/pdf",
  size: 1024,
  lastModified: 123,
});

const show = () =>
  renderHook(() => useFilesPage(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={["/files?view=recent"]}>
        <FilesPageProvider>{children}</FilesPageProvider>
      </MemoryRouter>
    ),
  });

/** Long enough to cover the hook's coalescing window with room to spare. */
const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("library refresh ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Each test supplies its own read queue, so leftovers must not leak.
    state.read.mockReset();
    state.revision = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not publish a scan that a newer one superseded", async () => {
    let releaseSlow!: () => void;
    const slow = new Promise<StirlingFileStub[]>((resolve) => {
      releaseSlow = () => resolve([stub("stale")]);
    });
    state.read
      .mockImplementationOnce(() => slow)
      .mockImplementation(async () => [stub("fresh")]);

    const { result, rerender } = show();
    await settle(1);
    expect(state.read).toHaveBeenCalledTimes(1);

    state.revision = 1;
    rerender();
    await settle(400);
    expect(state.read).toHaveBeenCalledTimes(2);
    expect(result.current.fileMap.has("fresh" as FileId)).toBe(true);

    // The superseded scan lands last, carrying the library it started from.
    await act(async () => {
      releaseSlow();
      await slow;
    });

    expect(result.current.fileMap.has("fresh" as FileId)).toBe(true);
    expect(result.current.fileMap.has("stale" as FileId)).toBe(false);
  });

  it("keeps the spinner up while a newer scan is still in flight", async () => {
    let releaseSuperseded!: () => void;
    let releaseLatest!: () => void;
    const superseded = new Promise<StirlingFileStub[]>((resolve) => {
      releaseSuperseded = () => resolve([stub("stale")]);
    });
    const latest = new Promise<StirlingFileStub[]>((resolve) => {
      releaseLatest = () => resolve([stub("fresh")]);
    });
    state.read
      .mockImplementationOnce(() => superseded)
      .mockImplementationOnce(() => latest);

    const { result, rerender } = show();
    await settle(1);
    state.revision = 1;
    rerender();
    await settle(400);
    expect(state.read).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);

    // The superseded scan settling must not clear the spinner the newer scan
    // is still responsible for.
    await act(async () => {
      releaseSuperseded();
      await superseded;
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      releaseLatest();
      await latest;
    });
    expect(result.current.loading).toBe(false);
  });

  it("does not report an error from a scan that outlives unmount", async () => {
    let failScan!: (error: Error) => void;
    const scan = new Promise<StirlingFileStub[]>((_resolve, reject) => {
      failScan = reject;
    });
    state.read.mockImplementation(() => scan);

    const { unmount } = show();
    await settle(1);
    expect(state.read).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      failScan(new Error("scan failed after unmount"));
      await scan.catch(() => {});
    });

    expect(state.folders.setError).not.toHaveBeenCalled();
  });
});
