import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileContextState, FileId } from "@app/types/fileContext";

const { invoke, open, readFile, storeStirlingFile } = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  readFile: vi.fn(),
  storeStirlingFile: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile }));
vi.mock("@app/services/localFolderStorage", () => ({
  directoryKey: (path: string) => path,
  localFolderStorage: {
    getAllFolders: async () => [{ directory: "/Downloads" }],
  },
}));
vi.mock("@core/services/localFolderStorage", () => ({
  directoryKey: (path: string) => path,
  localFolderStorage: {
    getAllFolders: async () => [{ directory: "/Downloads" }],
  },
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { storeStirlingFile, updateThumbnail: vi.fn() },
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: vi.fn(),
}));
vi.mock("@app/services/fileAnalyzer", () => ({
  FileAnalyzer: { isPDFUserPasswordProtected: async () => false },
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

import { addFiles } from "@app/contexts/file/fileActions";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { readDiskFile } from "@app/services/localFolderContents";
import { captureDroppedFilePaths } from "@app/services/fileImportPaths";

const PATH = "/Downloads/report.pdf";
const BYTES = new Uint8Array([37, 80, 68, 70]);
let stopCapturingDrops: () => void;

function dropFiles(files: File[]) {
  const event = new Event("drop", { bubbles: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  document.dispatchEvent(event);
}

async function importFiles(files: File[]) {
  const state = {
    files: { ids: [], byId: {} },
    pinnedFiles: new Set(),
    ui: { selectedFileIds: [], selectedPageNumbers: [] },
  } as unknown as FileContextState;
  const dispatch = vi.fn();
  await addFiles(
    {
      files,
      skipMetadataHydration: true,
      skipUploadTracking: true,
      skipWorkspaceDispatch: true,
    },
    { current: state },
    { current: new Map<FileId, File>() },
    dispatch,
    {} as never,
    true,
  );
  return storeStirlingFile.mock.calls.map(([, stub]) => stub);
}

beforeEach(() => {
  vi.clearAllMocks();
  stopCapturingDrops = captureDroppedFilePaths();
  open.mockResolvedValue([PATH]);
  readFile.mockResolvedValue(BYTES);
  storeStirlingFile.mockResolvedValue(undefined);
  invoke.mockImplementation(async (command: string) => {
    if (command === "resolve_dropped_file_paths") return [PATH];
    if (command === "file_disk_state")
      return { availability: "present", size: BYTES.length, modifiedMs: 5000 };
    throw new Error(`Unexpected command: ${command}`);
  });
});

afterEach(() => {
  stopCapturingDrops();
  vi.unstubAllGlobals();
});

describe("desktop imports retain a save target on the initial stored record", () => {
  it("persists a native picker selection with its path and baseline", async () => {
    const files = await openFilesFromDisk();
    expect(await importFiles(files)).toEqual([
      expect.objectContaining({
        localFilePath: PATH,
        diskSyncedSize: BYTES.length,
        diskSyncedModifiedMs: 5000,
      }),
    ]);
  });

  it("keeps the mounted-folder path during an unopened magic-trick import", async () => {
    const file = await readDiskFile({
      path: PATH,
      name: "report.pdf",
      sizeBytes: BYTES.length,
      lastModified: 5000,
    });
    expect(file).not.toBeNull();
    expect(await importFiles([file!])).toEqual([
      expect.objectContaining({
        localFilePath: PATH,
        diskSyncedModifiedMs: 5000,
      }),
    ]);
  });

  it("persists the resolved path of a dropped file", async () => {
    const file = new File([BYTES], "report.pdf", {
      type: "application/pdf",
      lastModified: 5000,
    });
    dropFiles([file]);
    expect(await importFiles([file])).toEqual([
      expect.objectContaining({ localFilePath: PATH }),
    ]);
    expect(invoke).toHaveBeenCalledWith("resolve_dropped_file_paths", {
      files: [{ name: "report.pdf", size: BYTES.length, lastModified: 5000 }],
    });
  });

  it("does not give an unrelated upload the path of a same-metadata file", async () => {
    const original = new File([BYTES], "report.pdf", { lastModified: 5000 });
    const copy = new File([BYTES], "report.pdf", { lastModified: 5000 });
    dropFiles([original]);
    const [stub] = await importFiles([copy]);
    expect(stub.localFilePath).toBeUndefined();
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "resolve_dropped_file_paths",
      ),
    ).toHaveLength(1);
  });

  it("waits for captured drop paths before persisting through addFiles", async () => {
    let resolvePaths!: (paths: string[]) => void;
    const paths = new Promise<string[]>((resolve) => {
      resolvePaths = resolve;
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === "resolve_dropped_file_paths") return paths;
      return { availability: "present", size: BYTES.length, modifiedMs: 5000 };
    });
    const file = new File([BYTES], "report.pdf");
    dropFiles([file]);
    const importing = importFiles([file]);
    expect(storeStirlingFile).not.toHaveBeenCalled();
    resolvePaths([PATH]);
    expect(await importing).toEqual([
      expect.objectContaining({ localFilePath: PATH }),
    ]);
  });

  it("removes the global drop listener during app cleanup", async () => {
    stopCapturingDrops();
    const file = new File([BYTES], "report.pdf");
    dropFiles([file]);
    const [stub] = await importFiles([file]);
    expect(stub.localFilePath).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not open a pathless browser picker after native cancellation", async () => {
    open.mockResolvedValue(null);
    const onFallbackOpen = vi.fn();
    expect(await openFilesFromDisk({ onFallbackOpen })).toEqual([]);
    expect(onFallbackOpen).not.toHaveBeenCalled();
  });

  it("imports unresolved drops without inventing a save target", async () => {
    invoke.mockRejectedValue(new Error("No native path available"));
    const file = new File([BYTES], "report.pdf");
    dropFiles([file]);
    const [stub] = await importFiles([file]);
    expect(stub.localFilePath).toBeUndefined();
  });

  it("uses WebView2's actual DOM file paths on Windows", async () => {
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => "file-drop-request",
    });
    let listener: ((event: MessageEvent) => void) | undefined;
    const removeEventListener = vi.fn();
    const postMessageWithAdditionalObjects = vi.fn(
      (message: string, files: File[]) => {
        const request = JSON.parse(message);
        expect(files).toHaveLength(1);
        listener?.(
          new MessageEvent("message", {
            data: {
              type: "stirling-file-drop-result",
              requestId: request.requestId,
              paths: [PATH],
            },
          }),
        );
      },
    );
    vi.stubGlobal("chrome", {
      webview: {
        postMessageWithAdditionalObjects,
        addEventListener: (
          _type: string,
          handler: (event: MessageEvent) => void,
        ) => {
          listener = handler;
        },
        removeEventListener,
      },
    });
    const file = new File([BYTES], "report.pdf");
    expect(await importFiles([file])).toEqual([
      expect.objectContaining({ localFilePath: PATH }),
    ]);
    expect(removeEventListener).toHaveBeenCalledWith("message", listener);
    expect(invoke).not.toHaveBeenCalledWith(
      "resolve_dropped_file_paths",
      expect.anything(),
    );
  });
});
