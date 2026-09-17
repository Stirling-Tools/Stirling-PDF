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
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("file picker caller contract", () => {
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
    await act(() =>
      result.current.onRecentFileSelect(
        [createNewStirlingFileStub(stored)],
        [upload],
      ),
    );
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

  it("keeps the picker open and does not call the insertion handler if a selected file disappears", async () => {
    state.getStirlingFile.mockResolvedValue(null);
    const handler = vi.fn();
    const stub = createNewStirlingFileStub(new File(["local"], "Missing.pdf"));
    const { result } = renderHook(useFilesModalContext, {
      wrapper: FilesModalProvider,
    });
    act(() => result.current.openFilesModal({ customHandler: handler }));
    await act(async () => {
      await expect(result.current.onRecentFileSelect([stub])).rejects.toThrow(
        "Missing.pdf",
      );
    });
    expect(handler).not.toHaveBeenCalled();
    expect(result.current.isFilesModalOpen).toBe(true);
  });
});
