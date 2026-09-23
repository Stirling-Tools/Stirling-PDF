import { beforeEach, describe, expect, test, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type {
  LocalProcessingFile,
  LocalProcessingFolder,
} from "@app/services/localProcessingFolderStorage";
import type { DiskFileEntry } from "@app/services/localFolderContents";

const mocks = vi.hoisted(() => ({
  folders: new Map<string, LocalProcessingFolder>(),
  files: new Map<string, LocalProcessingFile>(),
  connected: true,
  diskContent: "input",
  otherDiskFiles: [] as DiskFileEntry[],
  disk: {
    path: "/downloads/a.pdf",
    name: "a.pdf",
    sizeBytes: 10,
    lastModified: 1,
  } as DiskFileEntry,
  submit: vi.fn(),
  wait: vi.fn(),
  download: vi.fn(),
  replace: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
  original: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@app/services/localProcessingOriginals", () => ({
  reconcileLocalProcessingOriginals: mocks.reconcile,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ remove: mocks.remove }));
vi.mock("@app/services/localFolderStorage", () => ({
  directoryKey: (value: string) => value.replace(/\/$/, ""),
  localFolderStorage: {
    getAllFolders: async () => [{ directory: "/downloads" }],
  },
}));
vi.mock("@app/services/localProcessingFolderStorage", () => ({
  localProcessingFolderStorage: {
    folders: async () => [...mocks.folders.values()],
    folder: async (id: string) => mocks.folders.get(id),
    saveFolder: async (folder: LocalProcessingFolder) => {
      mocks.folders.set(folder.id, folder);
    },
    deleteFolder: async (id: string) => {
      mocks.folders.delete(id);
    },
    files: async (id: string) =>
      [...mocks.files.values()].filter((file) => file.folderId === id),
    saveFile: async (file: LocalProcessingFile) => {
      mocks.files.set(file.id, file);
    },
    deleteFile: async (id: string) => {
      mocks.files.delete(id);
    },
  },
}));
vi.mock("@app/services/serverAutomationSession", () => ({
  getServerAutomationSession: async () => {
    if (!mocks.connected) throw new Error("Sign in");
    return { key: "owner", baseUrl: "https://connected.test" };
  },
  requireAutomationSession: async (key: string) => {
    if (!mocks.connected || key !== "owner") throw new Error("Sign in");
  },
}));
vi.mock("@app/services/localFolderContents", () => ({
  listDirectory: async () => ({
    files: [{ ...mocks.disk }, ...mocks.otherDiskFiles],
    directories: [],
  }),
  readDiskFile: async () =>
    new File([mocks.diskContent], "a.pdf", { type: "application/pdf" }),
  writeDiskFile: vi.fn(),
}));
vi.mock("@app/services/serverPipeline", () => ({
  submitServerPipeline: mocks.submit,
  waitForServerPipeline: mocks.wait,
  downloadServerPipelineOutput: mocks.download,
}));
vi.mock("@app/services/localProcessingDelivery", () => ({
  archiveProcessingInput: mocks.archive,
  replaceProcessingFile: mocks.replace,
  processingFileState: async () => mocks.disk,
  processingPath: (directory: string, name: string) => `${directory}/${name}`,
  sameProcessingFile: (a: DiskFileEntry, b: DiskFileEntry) =>
    a.path === b.path &&
    a.lastModified === b.lastModified &&
    a.sizeBytes === b.sizeBytes,
  requireUnchangedProcessingFile: async (entry: DiskFileEntry) => {
    if (entry.lastModified !== mocks.disk.lastModified)
      throw new Error("File changed");
  },
  readProcessingOriginal: mocks.original,
}));
import {
  saveLocalProcessingFolder,
  sweepLocalProcessingFolder,
  scanLocalProcessingFolders,
  revertLocalProcessingFile,
} from "@app/services/localProcessingFolders";

const request = {
  directory: "/downloads",
  steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
};
function onlyFile() {
  return [...mocks.files.values()][0];
}

describe("desktop processing folder handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconcile.mockImplementation(async (_folder, history) => history);
    mocks.files.clear();
    mocks.folders.clear();
    mocks.connected = true;
    mocks.diskContent = "input";
    mocks.otherDiskFiles = [];
    mocks.disk = {
      path: "/downloads/a.pdf",
      name: "a.pdf",
      sizeBytes: 10,
      lastModified: 1,
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          _name: string,
          optionsOrCallback: unknown,
          callback?: (lock: object) => Promise<unknown>,
        ) =>
          typeof optionsOrCallback === "function"
            ? optionsOrCallback({})
            : callback?.({}),
      },
    });
    mocks.submit.mockResolvedValue("server-run");
    mocks.wait.mockResolvedValue({
      status: "COMPLETED",
      stepCount: 1,
      outputs: [{ fileId: "result", fileName: "a.pdf" }],
    });
    mocks.download.mockResolvedValue(
      new File(["result"], "a.pdf", { type: "application/pdf" }),
    );
    mocks.archive.mockResolvedValue("/downloads/.stirling/a.pdf");
    mocks.original.mockResolvedValue(new File(["original"], "a.pdf"));
    mocks.replace.mockImplementation(async () => {
      mocks.disk = { ...mocks.disk, lastModified: 2, sizeBytes: 5 };
      return { ...mocks.disk };
    });
  });

  test("uploads bytes and the whole pipeline, then saves server outputs locally", async () => {
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));
    expect(mocks.submit).toHaveBeenCalledWith(
      { key: "owner", baseUrl: "https://connected.test" },
      "downloads",
      [
        {
          operation: "/api/v1/misc/compress-pdf",
          parameters: {},
          fileParameters: {},
        },
      ],
      [expect.any(File)],
      [],
    );
    expect(onlyFile().serverRunId).toBe("server-run");
    expect(onlyFile().run.outputs?.[0].fileName).toBe("/downloads/a.pdf");
    expect(mocks.archive).toHaveBeenCalledBefore(mocks.replace);
    await sweepLocalProcessingFolder(folder.id);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  test("cannot enable processing without a server session", async () => {
    mocks.connected = false;
    await expect(saveLocalProcessingFolder(request)).rejects.toThrow("Sign in");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.folders.size).toBe(0);
  });

  test("paused folders still reconcile backup retention without processing", async () => {
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));
    const paused = { ...folder, enabled: false };
    mocks.folders.set(folder.id, paused);
    mocks.reconcile.mockClear();

    await scanLocalProcessingFolders();

    expect(mocks.reconcile).toHaveBeenCalledWith(paused, [onlyFile()]);
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  test("a different same-name document replaces the backup and restores the new original", async () => {
    mocks.archive.mockImplementation(async (_directory, file) => {
      mocks.original.mockResolvedValue(file);
      return "/downloads/.stirling/a.pdf";
    });
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));
    const originalPath = onlyFile().originalPath;
    mocks.disk = { ...mocks.disk, lastModified: 3 };
    mocks.diskContent = "another invoice";

    await sweepLocalProcessingFolder(folder.id);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onlyFile().run.status).toBe("COMPLETED"));

    expect(onlyFile().originalPath).toBe(originalPath);
    expect(mocks.archive).toHaveBeenCalledTimes(2);
    expect(mocks.archive).toHaveBeenLastCalledWith(
      "/downloads",
      expect.any(File),
      true,
    );
    await revertLocalProcessingFile(folder.id, "a.pdf");
    expect(mocks.replace).toHaveBeenLastCalledWith(
      expect.anything(),
      mocks.archive.mock.calls[1][1],
    );
  });

  test.each([
    "/downloads/.stirling/a.pdf",
    "/downloads/.stirling-originals/old-a.pdf",
  ])("restoring consumes the backup at %s", async (originalPath) => {
    mocks.archive.mockResolvedValueOnce(originalPath);
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));

    await revertLocalProcessingFile(folder.id, "a.pdf");

    expect(mocks.original).toHaveBeenCalledWith(originalPath);
    expect(mocks.remove).toHaveBeenCalledWith(originalPath);
    expect(mocks.files.size).toBe(0);
  });

  test("a file edited while the server works is never overwritten", async () => {
    mocks.wait.mockImplementationOnce(async () => {
      mocks.disk = { ...mocks.disk, lastModified: 20 };
      return {
        status: "COMPLETED",
        stepCount: 1,
        outputs: [{ fileId: "result", fileName: "a.pdf" }],
      };
    });
    await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("FAILED"));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(onlyFile().run.error).toBe("File changed");
  });

  test("restoring a failed delivery restores the original even without recorded outputs", async () => {
    mocks.replace.mockRejectedValueOnce(new Error("Delivery failed"));
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("FAILED"));
    const entry = onlyFile();
    expect(entry.outputs).toEqual([]);

    await revertLocalProcessingFile(folder.id, "a.pdf");

    expect(mocks.replace).toHaveBeenLastCalledWith(
      entry.input,
      expect.any(File),
    );
    expect(mocks.remove).toHaveBeenCalledWith(entry.originalPath);
    expect(mocks.files.size).toBe(0);
  });

  test("failed restoration retains the backup and processing record", async () => {
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));
    mocks.replace.mockRejectedValueOnce(new Error("Disk full"));

    await expect(revertLocalProcessingFile(folder.id, "a.pdf")).rejects.toThrow(
      "Disk full",
    );

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.files.size).toBe(1);
  });

  test("reconnect resumes an existing server run without charging another submission", async () => {
    mocks.wait.mockImplementationOnce(async () => {
      mocks.connected = false;
      throw new Error("Disconnected");
    });
    await saveLocalProcessingFolder(request);
    await waitFor(() => expect(mocks.wait).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.connected = true;
    await scanLocalProcessingFolders();
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.wait).toHaveBeenLastCalledWith(
      { key: "owner", baseUrl: "https://connected.test" },
      "server-run",
    );
  });

  test("background scans leave failed files parked until an explicit retry", async () => {
    mocks.wait.mockRejectedValueOnce(new Error("Insufficient credits"));
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("FAILED"));
    await scanLocalProcessingFolders();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    await sweepLocalProcessingFolder(folder.id);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));
    expect(mocks.submit).toHaveBeenCalledTimes(2);
  });

  test("an uncertain submission is parked after reconnect instead of submitted twice", async () => {
    mocks.submit.mockImplementationOnce(async () => {
      mocks.connected = false;
      throw new Error("Connection lost before receiving a run id");
    });
    await saveLocalProcessingFolder(request);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    mocks.connected = true;
    await scanLocalProcessingFolders();
    await waitFor(() => expect(onlyFile()?.run.status).toBe("FAILED"));
    expect(onlyFile().run.error).toContain(
      "previous submission could not be confirmed",
    );
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  test("retrying one file preserves its archived original and leaves other failures parked", async () => {
    mocks.wait.mockRejectedValueOnce(new Error("Insufficient credits"));
    const folder = await saveLocalProcessingFolder(request);
    await waitFor(() => expect(onlyFile()?.run.status).toBe("FAILED"));
    const originalPath = onlyFile().originalPath;
    const other: LocalProcessingFile = {
      ...onlyFile(),
      id: "other",
      input: { ...mocks.disk, path: "/downloads/b.pdf", name: "b.pdf" },
      run: { ...onlyFile().run, runId: "other-run" },
    };
    mocks.files.set(other.id, other);
    mocks.otherDiskFiles = [other.input];
    await sweepLocalProcessingFolder(folder.id, true, "a.pdf");
    await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));
    expect(onlyFile().originalPath).toBe(originalPath);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    expect(mocks.files.get("other")?.run.status).toBe("FAILED");
    expect(mocks.submit).toHaveBeenCalledTimes(2);
  });

  test("signing out during output download prevents local delivery", async () => {
    mocks.download.mockImplementationOnce(async () => {
      mocks.connected = false;
      return new File(["result"], "a.pdf");
    });
    await saveLocalProcessingFolder(request);
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(onlyFile()?.serverRunId).toBe("server-run");
  });
});
