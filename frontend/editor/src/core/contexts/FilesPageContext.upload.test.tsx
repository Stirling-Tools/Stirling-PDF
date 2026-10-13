import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FilesPageProvider,
  useFilesPage,
} from "@app/contexts/FilesPageContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FolderId, FolderRecord } from "@app/types/folder";
import type { FileId } from "@app/types/file";

const state = vi.hoisted(() => ({
  files: [] as StirlingFileStub[],
  upload: vi.fn(),
  bulkMove: vi.fn(),
  cacheMove: vi.fn(),
  updateMetadata: vi.fn(),
  folders: {
    folders: [] as FolderRecord[],
    foldersById: new Map<FolderId, FolderRecord>(),
    currentFolderId: null,
    setError: vi.fn(),
  },
  actions: { updateStirlingFileStub: vi.fn() },
  disk: { openFileIdsRef: { current: [] }, onOpenFilesDetached: vi.fn() },
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getAllStirlingFileStubs: async () => state.files,
    getStirlingFileStub: async (id: FileId) =>
      state.files.find((file) => file.id === id),
    updateFileMetadata: state.updateMetadata,
  },
}));
vi.mock("@app/services/serverStorageUpload", () => ({
  uploadHistoryChain: state.upload,
}));
vi.mock("@app/services/folderSyncService", () => ({
  folderSyncService: { bulkMoveFiles: state.bulkMove },
}));
vi.mock("@app/services/fileSyncService", () => ({
  reconcileServerFiles: async (files: StirlingFileStub[]) => files,
}));
vi.mock("@app/services/pruneMissingRecentFiles", () => ({
  pruneMissingRecentFiles: async (files: StirlingFileStub[]) => files,
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ moveFilesToFolder: state.cacheMove }),
  useIndexedDBRevision: () => 0,
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => state.folders,
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileActions: () => ({ actions: state.actions }),
}));
vi.mock("@app/hooks/useDiskLinkReconcile", () => ({
  useDiskLinkReconcile: () => state.disk,
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { storageEnabled: true } }),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ isAnonymous: false }),
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

describe("adding browser files to the library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.files = [stub("one"), stub("two"), stub("three")];
    state.updateMetadata.mockImplementation(
      async (id: FileId, patch: Partial<StirlingFileStub>) => {
        state.files = state.files.map((file) =>
          file.id === id ? { ...file, ...patch } : file,
        );
      },
    );
    state.upload.mockImplementation(async (id: FileId) => ({
      remoteId: state.files.findIndex((file) => file.id === id) + 1,
      updatedAt: 123,
      chain: [state.files.find((file) => file.id === id)],
    }));
    state.bulkMove.mockImplementation(async (ids: number[]) => ({
      movedFileIds: ids,
      skippedFileIds: [],
    }));
  });

  it("uploads separate files to root and keeps Recents selected", async () => {
    const { result } = show();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() =>
      result.current.moveFilesTo([state.files[0].id, state.files[1].id], null, {
        uploadToRoot: true,
      }),
    );
    expect(state.upload).toHaveBeenCalledTimes(2);
    expect(state.bulkMove).toHaveBeenCalledWith([1, 2], null);
    expect(state.cacheMove).toHaveBeenCalledWith(["one", "two"], null);
    expect(result.current.fileMap.get("one" as FileId)?.remoteStorageId).toBe(
      1,
    );
    expect(result.current.fileMap.get("two" as FileId)?.remoteStorageId).toBe(
      2,
    );
    expect(result.current.currentTab).toBe("recent");
  });

  it("places successful uploads in the chosen folder even when a file between them fails", async () => {
    const normalUpload = state.upload.getMockImplementation()!;
    state.upload.mockImplementation(async (id: FileId) => {
      if (id === "two") throw new Error("Missing file data");
      return normalUpload(id);
    });
    const { result } = show();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(
        result.current.moveFilesTo(
          state.files.map((file) => file.id),
          "target" as FolderId,
          { uploadToRoot: true },
        ),
      ).rejects.toThrow("two.pdf: Missing file data");
    });
    expect(state.bulkMove).toHaveBeenCalledWith([1, 3], "target");
    expect(state.cacheMove).toHaveBeenCalledWith(["one", "three"], "target");
    expect(
      result.current.fileMap.get("two" as FileId)?.remoteStorageId,
    ).toBeUndefined();
  });

  it("does not upload a normal move to root", async () => {
    const { result } = show();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.moveFilesTo([state.files[0].id], null));
    expect(state.upload).not.toHaveBeenCalled();
  });

  it("reports a refused destination instead of reporting a successful add", async () => {
    state.bulkMove.mockResolvedValue({ movedFileIds: [], skippedFileIds: [1] });
    const { result } = show();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(
        result.current.moveFilesTo([state.files[0].id], "target" as FolderId, {
          uploadToRoot: true,
        }),
      ).rejects.toThrow();
    });
    expect(state.cacheMove).not.toHaveBeenCalled();
  });
});
