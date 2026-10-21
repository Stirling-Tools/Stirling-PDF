import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLibraryUpload } from "@app/components/filesPage/useLibraryUpload";
import type { FolderId, FolderRecord } from "@app/types/folder";

const mocks = vi.hoisted(() => ({
  addFiles: vi.fn(),
  writeIntoMount: vi.fn(),
  folders: {
    currentFolderId: null as FolderId | null,
    foldersById: new Map<FolderId, FolderRecord>(),
    setError: vi.fn(),
  },
  library: {
    currentTab: "all",
    moveFilesTo: vi.fn(),
    refresh: vi.fn(),
    bumpDiskRevision: vi.fn(),
    setCurrentTab: vi.fn(),
    setOriginFilter: vi.fn(),
    setSearch: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => mocks.folders,
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  useFilesPage: () => mocks.library,
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: mocks.addFiles }),
}));
vi.mock("@app/services/mountWrites", () => ({
  writeIntoMount: mocks.writeIntoMount,
}));

const folderId = "folder" as FolderId;
const files = [new File(["pdf"], "document.pdf", { type: "application/pdf" })];

function openFolder(kind: FolderRecord["kind"]) {
  mocks.folders.currentFolderId = folderId;
  mocks.folders.foldersById.set(folderId, {
    id: folderId,
    kind,
    name: "Documents",
    parentFolderId: null,
    directory: "/documents",
    createdAt: 0,
    updatedAt: 0,
  });
}

describe("library imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.folders.currentFolderId = null;
    mocks.folders.foldersById.clear();
    mocks.library.currentTab = "all";
    mocks.addFiles.mockResolvedValue([{ fileId: "file" }]);
    mocks.writeIntoMount.mockResolvedValue({ failedCount: 0 });
  });

  it("keeps root imports local, opens Recent, and leaves the editor untouched", async () => {
    const { result } = renderHook(() => useLibraryUpload());
    await result.current(files);

    expect(mocks.addFiles).toHaveBeenCalledWith(files, {
      selectFiles: false,
      skipWorkspaceDispatch: true,
    });
    expect(mocks.library.moveFilesTo).not.toHaveBeenCalled();
    expect(mocks.library.refresh).toHaveBeenCalledOnce();
    expect(mocks.library.setCurrentTab).toHaveBeenCalledWith("recent");
    expect(mocks.library.setOriginFilter).toHaveBeenCalledWith("all");
    expect(mocks.library.setSearch).toHaveBeenCalledWith("");
  });

  it("saves imports to the open server folder without changing views", async () => {
    openFolder("server");
    const { result } = renderHook(() => useLibraryUpload());
    await result.current(files);

    expect(mocks.addFiles).toHaveBeenCalledWith(files, {
      selectFiles: false,
      skipWorkspaceDispatch: true,
      folderId,
    });
    expect(mocks.library.moveFilesTo).toHaveBeenCalledWith(["file"], folderId);
    expect(mocks.library.setCurrentTab).not.toHaveBeenCalled();
  });

  it("does not send virtual-folder imports to the server", async () => {
    openFolder("virtual");
    const { result } = renderHook(() => useLibraryUpload());
    await result.current(files);

    expect(mocks.addFiles).toHaveBeenCalledWith(
      files,
      expect.objectContaining({ folderId }),
    );
    expect(mocks.library.moveFilesTo).not.toHaveBeenCalled();
  });

  it("writes to mounted folders and refreshes their disk listing", async () => {
    openFolder("local");
    const { result } = renderHook(() => useLibraryUpload());
    await result.current(files);

    const [directory, entries] = mocks.writeIntoMount.mock.calls[0];
    expect(directory).toBe("/documents");
    expect(entries[0].name).toBe("document.pdf");
    expect(await entries[0].bytes()).toBe(files[0]);
    expect(mocks.library.bumpDiskRevision).toHaveBeenCalledOnce();
    expect(mocks.addFiles).not.toHaveBeenCalled();
    expect(mocks.library.moveFilesTo).not.toHaveBeenCalled();
  });

  it("ignores a remembered folder when importing from Recent", async () => {
    openFolder("server");
    mocks.library.currentTab = "recent";
    const { result } = renderHook(() => useLibraryUpload());
    await result.current(files);

    expect(mocks.addFiles).toHaveBeenCalledWith(
      files,
      expect.not.objectContaining({ folderId }),
    );
    expect(mocks.library.moveFilesTo).not.toHaveBeenCalled();
  });
});
