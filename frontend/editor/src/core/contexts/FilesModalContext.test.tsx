import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FilesModalProvider,
  useFilesModalContext,
} from "@app/contexts/FilesModalContext";
import {
  createNewStirlingFileStub,
  type StirlingFileStub,
} from "@app/types/fileContext";

const state = vi.hoisted(() => ({
  addFiles: vi.fn().mockResolvedValue(undefined),
  addStirlingFileStubs: vi.fn().mockResolvedValue(undefined),
  setSelectedFiles: vi.fn(),
  setWorkbench: vi.fn(),
  getStirlingFile: vi.fn(),
  apiGet: vi.fn(),
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: state.addFiles }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileActions: () => ({
    actions: {
      addStirlingFileStubs: state.addStirlingFileStubs,
      setSelectedFiles: state.setSelectedFiles,
    },
  }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({
    findFileId: () => "uploaded",
    selectors: { getSelectedStirlingFileStubs: () => [{ id: "already-open" }] },
  }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({
    actions: { setWorkbench: state.setWorkbench },
  }),
  useNavigationState: () => ({ workbench: "pageEditor" }),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getStirlingFile: state.getStirlingFile },
}));
vi.mock("@app/services/apiClient", () => ({ default: { get: state.apiGet } }));

beforeEach(() => vi.clearAllMocks());

describe("file picker caller contract", () => {
  it("preserves selection order when loading mixed sources", async () => {
    const local = new File(["local"], "Local.pdf");
    state.getStirlingFile.mockResolvedValue(local);
    state.apiGet.mockImplementation(async (path: string) => ({
      data: new Blob(["PDF"], { type: "application/pdf" }),
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${path.includes("share-links") ? "Shared.pdf" : "Server.pdf"}"`,
      },
    }));
    const server = {
      ...createNewStirlingFileStub(new File([], "Server.pdf")),
      id: "server-12" as StirlingFileStub["id"],
      remoteStorageId: 12,
    };
    const shared = {
      ...createNewStirlingFileStub(new File([], "Shared.pdf")),
      remoteShareToken: "share-token",
    };
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    const files = await result.current.loadFiles([
      server,
      createNewStirlingFileStub(local),
      shared,
    ]);
    expect(files.map((file) => file.name)).toEqual([
      "Server.pdf",
      "Local.pdf",
      "Shared.pdf",
    ]);
  });

  it("downloads a shared server entry once through its share link", async () => {
    state.apiGet.mockResolvedValue({
      data: new Blob(["PDF"], { type: "application/pdf" }),
      headers: { "content-type": "application/pdf" },
    });
    const shared = {
      ...createNewStirlingFileStub(new File([], "Shared.pdf")),
      id: "server-12" as StirlingFileStub["id"],
      remoteStorageId: 12,
      remoteShareToken: "share-token",
    };
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    const files = await result.current.loadFiles([shared]);
    expect(files.map((file) => file.name)).toEqual(["Shared.pdf"]);
    expect(state.apiGet).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/storage/share-links/share-token",
      expect.anything(),
    );
    expect(state.getStirlingFile).not.toHaveBeenCalled();
  });

  it("loads server and shared files through the existing download paths", async () => {
    state.apiGet.mockResolvedValue({
      data: new Blob(["PDF"], { type: "application/pdf" }),
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="Remote.pdf"',
      },
    });
    const server = {
      ...createNewStirlingFileStub(new File([], "Remote.pdf")),
      id: "server-12" as StirlingFileStub["id"],
      remoteStorageId: 12,
    };
    const shared = {
      ...createNewStirlingFileStub(new File([], "Shared.pdf")),
      remoteShareToken: "share-token",
    };
    const handler = vi.fn();
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    act(() => result.current.openFilesModal({ customHandler: handler }));
    await act(() => result.current.onRecentFileSelect([server, shared]));
    expect(state.apiGet).toHaveBeenCalledWith(
      "/api/v1/storage/files/12/download",
      expect.anything(),
    );
    expect(state.apiGet).toHaveBeenCalledWith(
      "/api/v1/storage/share-links/share-token",
      expect.anything(),
    );
    expect(handler.mock.calls[0][0]).toHaveLength(2);
    expect(state.setWorkbench).not.toHaveBeenCalled();
  });
  it("delivers stored and new files together to a page-insertion handler without navigation", async () => {
    const stored = new File(["local"], "Stored.pdf");
    const upload = new File(["upload"], "Upload.pdf");
    state.getStirlingFile.mockResolvedValue(stored);
    const handler = vi.fn();
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    act(() =>
      result.current.openFilesModal({
        insertAfterPage: 4,
        customHandler: handler,
        maxSelectable: 2,
      }),
    );
    await act(async () => {
      result.current.closeFilesModal();
      await result.current.onRecentFileSelect(
        [createNewStirlingFileStub(stored)],
        [upload],
      );
    });
    expect(handler).toHaveBeenCalledExactlyOnceWith([stored, upload], 4);
    expect(state.addFiles).not.toHaveBeenCalled();
    expect(state.setWorkbench).not.toHaveBeenCalled();
    expect(result.current.isFilesModalOpen).toBe(false);
  });

  it("adds to the existing workspace selection", async () => {
    const stored = createNewStirlingFileStub(new File(["local"], "Stored.pdf"));
    const upload = new File(["upload"], "Upload.pdf");
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    act(() => result.current.openFilesModal());
    await act(() => result.current.onRecentFileSelect([stored], [upload]));
    expect(state.addFiles).toHaveBeenCalledWith([upload]);
    expect(state.addStirlingFileStubs).toHaveBeenCalledWith([stored], {
      selectFiles: false,
    });
    expect(state.setSelectedFiles).toHaveBeenCalledWith([
      "already-open",
      stored.id,
      "uploaded",
    ]);
    expect(state.setWorkbench).toHaveBeenCalledWith("fileEditor");
  });

  it("does not close a reopened picker when a previous import finishes", async () => {
    let finishImport!: () => void;
    state.addFiles.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishImport = resolve;
      }),
    );
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    act(() => result.current.openFilesModal());
    let importing!: Promise<void>;
    act(() => {
      result.current.closeFilesModal();
      importing = result.current.onRecentFileSelect(
        [],
        [new File(["PDF"], "Upload.pdf")],
      );
    });
    expect(result.current.isFilesModalOpen).toBe(false);
    act(() => result.current.openFilesModal({ maxSelectable: 1 }));
    await act(async () => {
      finishImport();
      await importing;
    });
    expect(result.current.isFilesModalOpen).toBe(true);
    expect(result.current.maxSelectable).toBe(1);
  });

  it("closes a direct upload immediately and leaves a subsequently opened picker alone", async () => {
    let finishImport!: () => void;
    state.addFiles.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishImport = resolve;
      }),
    );
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    act(() => result.current.openFilesModal());
    let importing!: Promise<void>;
    act(() => {
      importing = result.current.onFileUpload([
        new File(["PDF"], "Upload.pdf"),
      ]);
    });
    expect(result.current.isFilesModalOpen).toBe(false);
    act(() => result.current.openFilesModal({ maxSelectable: 1 }));
    await act(async () => {
      finishImport();
      await importing;
    });
    expect(result.current.isFilesModalOpen).toBe(true);
    expect(result.current.maxSelectable).toBe(1);
  });

  it("rejects without calling the insertion handler or reopening the picker if a selected file disappears", async () => {
    state.getStirlingFile.mockResolvedValue(null);
    const handler = vi.fn();
    const stub = createNewStirlingFileStub(new File(["local"], "Missing.pdf"));
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    act(() => result.current.openFilesModal({ customHandler: handler }));
    await act(async () => {
      result.current.closeFilesModal();
      await expect(result.current.onRecentFileSelect([stub])).rejects.toThrow(
        "Missing.pdf",
      );
    });
    expect(handler).not.toHaveBeenCalled();
    expect(result.current.isFilesModalOpen).toBe(false);
  });
});
