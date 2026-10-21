import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileManager } from "@app/hooks/useFileManager";
import apiClient from "@app/services/apiClient";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn() },
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({}),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getLeafStirlingFileStubs: vi.fn(async () => []) },
}));
vi.mock("@app/services/pruneMissingRecentFiles", () => ({
  pruneMissingRecentFiles: vi.fn(async (stubs: unknown[]) => stubs),
}));
vi.mock("@app/hooks/useDiskLinkReconcile", () => ({
  useDiskLinkReconcile: () => ({
    openFileIdsRef: { current: [] },
    onOpenFilesDetached: vi.fn(),
  }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: { storageEnabled: true, storageShareLinksEnabled: true },
  }),
}));
const authState = vi.hoisted(() => ({ isAnonymous: false }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => authState }));

const mockGet = vi.mocked(apiClient.get);

describe("useFileManager server files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAnonymous = false;
    mockGet.mockResolvedValue({ data: [] });
  });

  it("does not ask the server for a guest's stored files", async () => {
    authState.isAnonymous = true;
    const { result } = renderHook(() => useFileManager());

    await act(async () => {
      await result.current.loadRecentFiles();
    });

    expect(mockGet).not.toHaveBeenCalled();
  });

  it("loads stored files and accessed share links for an account", async () => {
    const { result } = renderHook(() => useFileManager());

    await act(async () => {
      await result.current.loadRecentFiles();
    });

    const urls = mockGet.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "/api/v1/storage/files",
      "/api/v1/storage/share-links/accessed",
    ]);
  });
});
