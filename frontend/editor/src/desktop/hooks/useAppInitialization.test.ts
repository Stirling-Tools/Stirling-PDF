import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const PATH = "C:/docs/report.pdf";
const addFiles = vi.hoisted(() => vi.fn());
const addStirlingFileStubs = vi.hoisted(() => vi.fn(async () => []));
const setSelectedFiles = vi.hoisted(() => vi.fn());
const selectedStubs = vi.hoisted(() => vi.fn((): StirlingFileStub[] => []));
const storedCopiesForNewFiles = vi.hoisted(() => vi.fn());
const getDiskFileState = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@app/hooks/useOpenedFile", () => ({
  useOpenedFile: () => ({
    openedFilePaths: [PATH],
    loading: false,
    consumeOpenedFilePaths: () => [PATH],
  }),
}));
vi.mock("@app/services/fileOpenService", () => ({
  fileOpenService: {
    readFileAsArrayBuffer: vi.fn(async () => ({
      fileName: "report.pdf",
      arrayBuffer: new ArrayBuffer(4),
    })),
  },
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileManagement: () => ({ addFiles }),
  useFileActions: () => ({
    actions: { addStirlingFileStubs, setSelectedFiles },
  }),
  useFileSelectors: () => ({ getSelectedStirlingFileStubs: selectedStubs }),
}));
vi.mock("@app/contexts/file/storedFileReconciler", () => ({
  storedCopiesForNewFiles,
}));
vi.mock("@app/services/fileImportPaths", () => ({
  captureDroppedFilePaths: () => () => {},
}));
vi.mock("@app/services/desktopFileLink", () => ({
  desktopFileLinkingSupported: true,
  getDiskFileState,
  readFileFromDisk: vi.fn(async () => null),
}));

import { useAppInitialization } from "@app/hooks/useAppInitialization";

const stub = (id: string) => ({ id: id as FileId }) as StirlingFileStub;

async function open(): Promise<void> {
  renderHook(() => useAppInitialization());
  await waitFor(() => expect(setSelectedFiles).toHaveBeenCalled());
}

function openedFile(): File {
  const [[files]] = addFiles.mock.calls as unknown as [[File[]]];
  return files[0];
}

describe("useAppInitialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addFiles.mockImplementation(async (files: File[]) =>
      files.map((file) => Object.assign(file, { fileId: "new" })),
    );
    storedCopiesForNewFiles.mockResolvedValue(new Map());
    getDiskFileState.mockResolvedValue({
      availability: "present",
      size: 4,
      modifiedMs: 1_700_000_000_000,
    });
  });

  it("dates a file opened from Explorer as disk does", async () => {
    await open();
    expect(openedFile().lastModified).toBe(1_700_000_000_000);
  });

  it("dates it now when disk cannot say", async () => {
    getDiskFileState.mockResolvedValue({ availability: "gone" });
    const before = Date.now();
    await open();
    expect(openedFile().lastModified).toBeGreaterThanOrEqual(before);
  });

  it("reopens the stored copy instead of storing the file again", async () => {
    storedCopiesForNewFiles.mockImplementation(
      async (files: File[]) => new Map([[files[0], stub("stored")]]),
    );

    await open();

    expect(addStirlingFileStubs).toHaveBeenCalledWith([stub("stored")]);
    expect(addFiles).not.toHaveBeenCalled();
    expect(setSelectedFiles).toHaveBeenCalledWith(["stored"]);
  });

  it("adds what it opened to the selection, once", async () => {
    selectedStubs.mockReturnValue([stub("earlier"), stub("new")]);

    await open();

    expect(setSelectedFiles).toHaveBeenCalledWith(["earlier", "new"]);
  });
});
