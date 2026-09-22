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
  mountedDirectories: ["/downloads"],
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
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ remove: vi.fn() }));
vi.mock("@app/services/localFolderStorage", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/services/localFolderStorage")
  >()),
  localFolderStorage: {
    getAllFolders: async () =>
      mocks.mountedDirectories.map((directory) => ({ directory })),
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
vi.mock("@app/services/localFolderContents", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/services/localFolderContents")
  >()),
  listDirectory: async () => ({
    files: [{ ...mocks.disk }, ...mocks.otherDiskFiles],
    directories: [],
  }),
  readDiskFile: async () =>
    new File(["input"], "a.pdf", { type: "application/pdf" }),
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
  readProcessingOriginal: vi.fn(),
}));
import {
  saveLocalProcessingFolder,
  sweepLocalProcessingFolder,
  scanLocalProcessingFolders,
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
    vi.resetAllMocks();
    mocks.files.clear();
    mocks.folders.clear();
    mocks.connected = true;
    mocks.mountedDirectories = ["/downloads"];
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
    mocks.archive.mockResolvedValue(
      "/downloads/.stirling-originals/original.pdf",
    );
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

  test.each([
    ["/downloads", "/downloads/invoices"],
    ["/downloads/", "/downloads/invoices/2026"],
    ["C:\\Users\\Reece\\Downloads\\", "c:/users/reece/downloads/invoices"],
    ["\\\\server\\share\\docs", "//SERVER/share/docs/invoices"],
    ["C:\\", "c:/invoices"],
    ["/", "/invoices"],
  ])(
    "processes %s's child %s through its parent mount",
    async (mount, directory) => {
      mocks.mountedDirectories = [mount];
      mocks.disk = { ...mocks.disk, path: `${directory}/a.pdf` };

      const folder = await saveLocalProcessingFolder({ ...request, directory });
      await waitFor(() => expect(onlyFile()?.run.status).toBe("COMPLETED"));

      expect(folder.directory).toBe(directory);
      expect(mocks.archive).toHaveBeenCalledWith(directory, expect.any(File));
      expect(onlyFile().run.outputs?.[0].fileName).toBe(`${directory}/a.pdf`);
      await sweepLocalProcessingFolder(folder.id);
      expect(mocks.submit).toHaveBeenCalledTimes(1);
    },
  );

  test.each(["/downloads-other", "/other", "/Downloads/invoices"])(
    "rejects processing outside the mounted directory: %s",
    async (directory) => {
      await expect(
        saveLocalProcessingFolder({ ...request, directory }),
      ).rejects.toThrow("Mount the directory before enabling processing");
      expect(mocks.submit).not.toHaveBeenCalled();
      expect(mocks.folders.size).toBe(0);
    },
  );

  test("unmounting the parent during processing blocks delivery and further sweeps", async () => {
    const directory = "/downloads/invoices";
    mocks.disk = { ...mocks.disk, path: `${directory}/a.pdf` };
    mocks.wait.mockImplementationOnce(async () => {
      mocks.mountedDirectories = [];
      return {
        status: "COMPLETED",
        stepCount: 1,
        outputs: [{ fileId: "result", fileName: "a.pdf" }],
      };
    });

    const folder = await saveLocalProcessingFolder({ ...request, directory });
    await waitFor(() => expect(onlyFile()?.run.status).toBe("FAILED"));

    expect(onlyFile().run.error).toBe(
      "The processing folder is no longer mounted",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    await expect(sweepLocalProcessingFolder(folder.id)).rejects.toThrow(
      "The processing folder is no longer mounted",
    );
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
