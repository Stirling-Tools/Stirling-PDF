import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const PATH = "C:/docs/report.pdf";
const addFiles = vi.hoisted(() => vi.fn(async () => []));
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

async function open(): Promise<void> {
  renderHook(() => useAppInitialization());
  await waitFor(() => expect(addFiles).toHaveBeenCalled());
}

function openedFile(): File {
  const [[files]] = addFiles.mock.calls as unknown as [[File[]]];
  return files[0];
}

describe("useAppInitialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
