import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@app/query/queryClient";
import { LibraryFilePicker } from "@app/components/filesPage/LibraryFilePicker";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FolderRecord } from "@app/types/folder";
import type { DiskFileEntry } from "@app/services/localFolderContents";
import { allowConsole } from "@app/tests/failOnConsole";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string | Record<string, unknown>,
      values?: Record<string, unknown>,
    ) => {
      const options = typeof fallback === "object" ? fallback : values;
      const text =
        typeof fallback === "string"
          ? fallback
          : String(options?.defaultValue ?? key);
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ""),
      );
    },
  }),
}));

const state = vi.hoisted(() => ({
  files: [] as StirlingFileStub[],
  folders: [] as FolderRecord[],
  diskFiles: [] as DiskFileEntry[],
  selected: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
  alert: vi.fn(),
  moveFolder: vi.fn(),
  createFolder: vi.fn(),
  listDirectory: vi.fn(),
  readDiskFile: vi.fn(),
  extractAllFiles: vi.fn(),
  registerDiskSubfolders: vi.fn(),
  maxSelectable: null as number | null,
  viewMode: "list" as "list" | "grid",
  storageEnabled: false,
  driveError: null as string | null,
  clearDriveError: vi.fn(),
}));

vi.mock("@app/contexts/FilesPageContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/contexts/FilesPageContext")>()),
  useFilesPage: () => ({
    allFiles: state.files,
    fileMap: new Map(state.files.map((file) => [file.id, file])),
    fileCountsByFolder: new Map(),
    loading: false,
    diskRevision: 0,
    viewMode: state.viewMode,
    setViewMode: vi.fn(),
  }),
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({
    folders: state.folders,
    foldersById: new Map(state.folders.map((folder) => [folder.id, folder])),
    currentFolderId: "behind-the-modal",
    setCurrentFolderId: state.moveFolder,
    registerDiskSubfolders: state.registerDiskSubfolders,
    createFolder: state.createFolder,
  }),
}));
vi.mock("@app/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({
    closeFilesModal: state.close,
    onRecentFileSelect: state.selected,
    maxSelectable: state.maxSelectable,
    loadFiles: vi.fn(),
  }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileIds: [] }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { storageEnabled: state.storageEnabled } }),
}));
vi.mock("@app/hooks/useSharingEnabled", () => ({
  useSharingEnabled: () => ({ sharingEnabled: false }),
}));
vi.mock("@app/hooks/useGoogleDrivePicker", () => ({
  useGoogleDrivePicker: () => ({
    isEnabled: false,
    error: state.driveError,
    clearError: state.clearDriveError,
  }),
}));
vi.mock("@app/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@app/hooks/usePolicyFileBadges", () => ({
  usePolicyFileBadges: () => new Map(),
}));
vi.mock("@app/hooks/useProcessingFolders", () => ({
  useProcessingFolders: () => ({ stateFor: () => undefined }),
}));
vi.mock("@app/hooks/useServerProcessingBlock", () => ({
  useServerProcessingBlock: () => null,
}));
vi.mock("@app/hooks/useLazyThumbnail", () => ({
  useLazyThumbnail: () => undefined,
  useDiskThumbnail: () => undefined,
}));
vi.mock("@app/components/shared/MobileUploadModal", () => ({
  default: () => null,
}));
vi.mock("@app/components/toast", () => ({ alert: state.alert }));
vi.mock("@app/services/localFolderContents", () => ({
  canListDirectory: true,
  listDirectory: state.listDirectory,
  readDiskFile: state.readDiskFile,
}));
vi.mock("@app/services/zipFileService", () => ({
  zipFileService: { extractAllFiles: state.extractAllFiles },
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getHistoryChainStubs: vi.fn().mockResolvedValue([]) },
}));

const file = (id: string, name: string, folderId: string | null = null) =>
  ({
    id,
    name,
    folderId,
    type: "application/pdf",
    size: 100,
    lastModified: 1,
    originalFileId: id,
    isLeaf: true,
    versionNumber: 1,
  }) as StirlingFileStub;
const folder = (id: string, name: string, extra = {}) =>
  ({
    id,
    name,
    kind: "virtual",
    parentFolderId: null,
    color: "blue",
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }) as FolderRecord;
const show = (
  supportedFormats?: string[],
  destination?: Parameters<typeof LibraryFilePicker>[0]["destination"],
) => {
  const client = createAppQueryClient();
  return render(
    <MantineProvider env="test">
      <LibraryFilePicker
        supportedFormats={supportedFormats}
        destination={destination}
        onBusyChange={vi.fn()}
        onExternalPickerChange={vi.fn()}
      />
    </MantineProvider>,
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  state.files = [file("one", "One.pdf"), file("two", "Two.pdf")];
  state.folders = [];
  state.diskFiles = [];
  state.maxSelectable = null;
  state.viewMode = "list";
  state.storageEnabled = false;
  state.driveError = null;
  state.clearDriveError.mockImplementation(() => {
    state.driveError = null;
  });
  state.listDirectory.mockImplementation(async () => ({
    files: state.diskFiles,
    directories: [],
  }));
  state.readDiskFile.mockImplementation(
    async (entry: DiskFileEntry) => new File(["PDF"], entry.name),
  );
});

describe("library file picker", () => {
  it.each(["list", "grid"] as const)(
    "sorts Recents by date added and displays that date in %s view",
    async (viewMode) => {
      state.viewMode = viewMode;
      const newlyAdded = {
        ...file("new", "New.pdf"),
        createdAt: Date.parse("2026-09-22T10:00:00Z"),
        lastModified: Date.parse("2000-01-01T10:00:00Z"),
        remoteStorageId: 1,
      };
      const olderUpload = {
        ...file("old", "Old.pdf"),
        createdAt: Date.parse("2026-09-01T10:00:00Z"),
        lastModified: Date.parse("2026-09-20T10:00:00Z"),
        remoteStorageId: 2,
      };
      state.files = [olderUpload, newlyAdded];
      const user = userEvent.setup();
      show();

      const fileOrder = () =>
        screen.getAllByText(/^(New|Old)\.pdf$/).map((node) => node.textContent);
      expect(fileOrder()).toEqual(["New.pdf", "Old.pdf"]);
      expect(
        screen.getByText(new Date(newlyAdded.createdAt).toLocaleString()),
      ).toBeVisible();
      expect(
        screen.queryByText(new Date(newlyAdded.lastModified).toLocaleString()),
      ).not.toBeInTheDocument();
      if (viewMode === "list")
        expect(
          screen.getByRole("columnheader", { name: /Added/ }),
        ).toBeVisible();

      await user.click(
        screen.getByRole("button", { name: "Sort files: Recent first" }),
      );
      await user.click(screen.getByRole("menuitem", { name: "Oldest first" }));
      expect(fileOrder()).toEqual(["Old.pdf", "New.pdf"]);

      await user.click(
        screen.getByRole("button", { name: "Stirling library", exact: true }),
      );
      expect(fileOrder()).toEqual(["Old.pdf", "New.pdf"]);
      expect(
        screen.getByText(new Date(newlyAdded.lastModified).toLocaleString()),
      ).toBeVisible();
      if (viewMode === "list")
        expect(
          screen.getByRole("columnheader", { name: /Modified/ }),
        ).toBeVisible();
    },
  );

  it("browses server destinations without selecting files or changing the page behind it", async () => {
    const invoices = folder("invoices", "Invoices", { kind: "server" });
    state.folders = [
      invoices,
      folder("browser", "Browser folder"),
      folder("disk", "Disk folder", { kind: "local" }),
    ];
    state.files = [{ ...file("cloud", "Existing.zip"), remoteStorageId: 1 }];
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    show(undefined, { fileCount: 2, onClose: vi.fn(), onConfirm });

    expect(
      screen.queryByRole("button", { name: "Recents" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Browser folder")).not.toBeInTheDocument();
    expect(screen.queryByText("Disk folder")).not.toBeInTheDocument();
    expect(screen.getByText("Existing.zip")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unzip" }),
    ).not.toBeInTheDocument();
    await user.dblClick(screen.getByText("Existing.zip"));
    expect(state.selected).not.toHaveBeenCalled();
    await user.click(screen.getByText("Invoices"));
    await user.click(screen.getByRole("button", { name: "Add here" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(invoices.id);
    expect(state.moveFolder).not.toHaveBeenCalled();
  });

  it("accepts an empty server library root as the destination", async () => {
    state.files = [];
    const onConfirm = vi.fn();
    show(undefined, { fileCount: 1, onClose: vi.fn(), onConfirm });
    await userEvent.click(screen.getByRole("button", { name: "Add here" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("creates a server folder and selects it without navigating the library page", async () => {
    const created = folder("new", "New destination", { kind: "server" });
    state.createFolder.mockImplementation(async () => {
      state.folders = [created];
      return created;
    });
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    show(undefined, { fileCount: 1, onClose: vi.fn(), onConfirm });
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(
      screen.getByRole("textbox", { name: "Folder name" }),
      created.name,
    );
    await user.click(
      screen.getByRole("button", { name: "Create", exact: true }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add here" }));
    expect(state.createFolder).toHaveBeenCalledWith(
      created.name,
      null,
      "server",
    );
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(created.id);
    expect(state.moveFolder).not.toHaveBeenCalled();
  });

  it("dismisses a Drive error without losing selected files", async () => {
    state.driveError = "Drive access denied";
    const user = userEvent.setup();
    const view = show();
    await user.click(screen.getByText("One.pdf"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Drive access denied");
    await user.click(within(alert).getByRole("button"));
    expect(state.clearDriveError).toHaveBeenCalledOnce();
    view.rerender(
      <MantineProvider env="test">
        <LibraryFilePicker
          onBusyChange={vi.fn()}
          onExternalPickerChange={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    expect(state.selected).toHaveBeenCalledExactlyOnceWith(
      [state.files[0]],
      [],
    );
  });

  it("shows the selected file's folder when browsing Recents", async () => {
    state.folders = [folder("invoices", "Invoices")];
    state.files = [file("filed", "Filed.pdf", "invoices")];
    const user = userEvent.setup();
    show();

    await user.click(screen.getByText("Filed.pdf"));
    await user.click(screen.getByRole("button", { name: "Details" }));
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    await user.click(details.getByRole("button", { name: "File info" }));

    expect(details.getByText("Invoices")).toBeVisible();
  });

  it.each(["list", "grid"] as const)(
    "keeps the %s selection when switching between the library and Recents",
    async (viewMode) => {
      state.viewMode = viewMode;
      const local = state.files[0];
      const server = { ...file("server", "Server.pdf"), remoteStorageId: 1 };
      state.files = [local, server];
      const user = userEvent.setup();
      show();
      await user.click(screen.getByText("One.pdf"));
      await user.click(
        screen.getByRole("button", {
          name: "Stirling library",
          pressed: false,
        }),
      );
      if (viewMode === "list") {
        await user.click(screen.getByRole("checkbox", { name: "Select all" }));
      } else {
        await user.click(screen.getByText("Server.pdf"));
      }
      const listing = screen.getByRole(viewMode === "list" ? "grid" : "list");
      expect(within(listing).queryByText("Recents")).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Recents", pressed: false }),
      );
      expect(screen.getByText("One.pdf")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add 2 files" }));
      expect(state.selected).toHaveBeenCalledExactlyOnceWith(
        [local, server],
        [],
      );
    },
  );

  it("keeps loose local files in Recent while root shows folders and server files", async () => {
    state.folders = [folder("folder", "Invoices")];
    const local = state.files[0];
    const organised = file("organised", "Filed.pdf", "folder");
    const orphan = file("orphan", "Unfiled.pdf", "missing-folder");
    const server = { ...file("server", "Server.pdf"), remoteStorageId: 1 };
    state.files = [local, organised, orphan, server];
    const user = userEvent.setup();
    show();
    expect(screen.getByText("One.pdf")).toBeInTheDocument();
    expect(screen.getByText("Unfiled.pdf")).toBeInTheDocument();
    await user.click(screen.getByText("One.pdf"));
    await user.click(
      screen.getByRole("button", { name: "Stirling library", pressed: false }),
    );
    expect(screen.queryByText("One.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Unfiled.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Server.pdf")).toBeInTheDocument();
    await user.click(screen.getByText("Invoices"));
    expect(screen.getByText("Filed.pdf")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Recents", pressed: false }),
    );
    expect(screen.getByText("One.pdf")).toBeInTheDocument();
    expect(screen.getByText("Unfiled.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    expect(state.selected).toHaveBeenCalledExactlyOnceWith([local], []);
  });

  it("closes immediately for a batch and reports import failures after unmounting", async () => {
    let rejectImport!: (error: Error) => void;
    state.selected.mockReturnValueOnce(
      new Promise<void>((_, reject) => {
        rejectImport = reject;
      }),
    );
    const user = userEvent.setup();
    const view = show();
    const uploads = Array.from(
      { length: 40 },
      (_, i) => new File(["PDF"], `Upload${i}.pdf`),
    );
    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: { files: uploads },
    });
    await user.click(screen.getByRole("button", { name: "Add 40 files" }));
    expect(state.close).toHaveBeenCalledTimes(1);
    expect(state.selected).toHaveBeenCalledExactlyOnceWith([], uploads);
    view.unmount();
    await act(async () => rejectImport(new Error("Storage is full.")));
    expect(state.alert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        alertType: "error",
        body: "Storage is full.",
      }),
    );
    expect(state.close).toHaveBeenCalledTimes(1);
  });

  it("filters staged imports out of Cloud without losing their selection", async () => {
    const serverFile = { ...file("server", "Server.pdf"), remoteStorageId: 1 };
    state.files.push(serverFile);
    const user = userEvent.setup();
    const view = show();
    const uploads = [
      new File(["PDF"], "New.pdf"),
      new File(["PDF"], "Other.pdf"),
    ];
    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: { files: uploads },
    });
    await user.click(screen.getByRole("textbox", { name: "Filter by source" }));
    await user.click(await screen.findByRole("option", { name: "Cloud" }));
    expect(screen.getByText("Server.pdf")).toBeInTheDocument();
    expect(screen.queryByText("One.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("New.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Other.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByText("Server.pdf"));
    await user.click(screen.getByRole("button", { name: "Add 3 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledExactlyOnceWith(
        [serverFile],
        uploads,
      ),
    );
  });

  it("keeps server files reachable with the source filter while browsing folders", async () => {
    state.storageEnabled = true;
    state.folders = [
      folder("browser", "Browser folder"),
      folder("server-folder", "Server folder", { kind: "server" }),
    ];
    state.files = [
      { ...file("root", "Root.pdf"), remoteStorageId: 1 },
      {
        ...file("missing", "Missing folder.pdf", "missing-folder"),
        remoteStorageId: 2,
      },
      {
        ...file("browser-file", "Browser folder copy.pdf", "browser"),
        remoteStorageId: 3,
      },
      { ...file("nested", "Nested.pdf", "server-folder"), remoteStorageId: 4 },
    ];
    const user = userEvent.setup();
    const view = show();
    expect(
      screen.queryByRole("button", { name: "Cloud" }),
    ).not.toBeInTheDocument();
    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["PDF"], "New.pdf")] },
    });
    await user.click(
      screen.getAllByRole("button", { name: "Stirling library" })[0],
    );
    await user.click(screen.getByRole("textbox", { name: "Filter by source" }));
    await user.click(await screen.findByRole("option", { name: "Cloud" }));
    expect(screen.getByText("Root.pdf")).toBeInTheDocument();
    expect(screen.getByText("Missing folder.pdf")).toBeInTheDocument();
    expect(screen.getByText("Browser folder copy.pdf")).toBeInTheDocument();
    expect(screen.queryByText("New.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Nested.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByText("Server folder"));
    expect(screen.getByText("Nested.pdf")).toBeInTheDocument();
    expect(screen.queryByText("New.pdf")).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Filter by source" }),
    ).toHaveValue("Cloud");
  });

  it("shows a readable error when a dropped file cannot be read", async () => {
    const view = show();
    fireEvent.drop(view.container.querySelector(".library-picker-dropzone")!, {
      dataTransfer: {
        items: [{ kind: "file", getAsFile: () => null }],
        types: ["Files"],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read a dropped file.",
    );
    expect(state.selected).not.toHaveBeenCalled();
  });

  it("stages readable files from a partial drop and names the failure", async () => {
    const user = userEvent.setup();
    const view = show();
    const file = new File(["PDF"], "Dropped.pdf");
    fireEvent.drop(view.container.querySelector(".library-picker-dropzone")!, {
      dataTransfer: {
        items: [
          { kind: "file", getAsFile: () => null },
          { kind: "file", getAsFile: () => file },
        ],
        types: ["Files"],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read a dropped file.",
    );
    expect(await screen.findByText("Dropped.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    expect(state.selected).toHaveBeenCalledExactlyOnceWith([], [file]);
  });

  it("keeps stored selections and readable disk files when another disk file disappears", async () => {
    allowConsole.error(/Could not read selected disk file/);
    state.folders = [
      folder("mount", "Documents", {
        kind: "local",
        directory: "C:/Documents",
      }),
    ];
    state.diskFiles = ["Missing.pdf", "Readable.pdf"].map((name) => ({
      path: `C:/Documents/${name}`,
      name,
      sizeBytes: 100,
      lastModified: 1,
    }));
    const readable = new File(["PDF"], "Readable.pdf");
    state.readDiskFile.mockImplementation(async (entry: DiskFileEntry) =>
      entry.name === "Missing.pdf" ? null : readable,
    );
    const user = userEvent.setup();
    show();
    await user.click(screen.getByText("One.pdf"));
    await user.click(
      screen.getByRole("button", { name: "Stirling library", pressed: false }),
    );
    await user.click(screen.getByText("Documents"));
    await user.click(await screen.findByText("Missing.pdf"));
    await user.click(screen.getByText("Readable.pdf"));
    await user.click(screen.getByRole("button", { name: "Add 3 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledExactlyOnceWith(
        [state.files[0]],
        [readable],
      ),
    );
    expect(state.close).toHaveBeenCalledOnce();
    expect(state.alert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ body: "Missing.pdf is no longer available." }),
    );
  });

  it("stages dropped files when the browser denies file-system handle access", async () => {
    vi.stubGlobal("isSecureContext", true);
    try {
      const user = userEvent.setup();
      const view = show();
      const dropped = new File(["PDF"], "Dropped.pdf", {
        type: "application/pdf",
      });
      const getFile = vi
        .fn()
        .mockRejectedValue(
          new DOMException("File-system access denied", "NotAllowedError"),
        );
      const getAsFileSystemHandle = vi.fn().mockResolvedValue({ getFile });
      const dataTransfer = {
        files: [dropped],
        items: [
          {
            kind: "file",
            type: dropped.type,
            getAsFile: () => dropped,
            getAsFileSystemHandle,
          },
        ],
        types: ["Files"],
      };
      fireEvent.drop(
        view.container.querySelector(".library-picker-dropzone")!,
        {
          dataTransfer,
        },
      );
      expect(await screen.findByText("Dropped.pdf")).toBeInTheDocument();
      expect(getAsFileSystemHandle).not.toHaveBeenCalled();
      expect(state.selected).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Add 1 files" }));
      await waitFor(() =>
        expect(state.selected).toHaveBeenCalledExactlyOnceWith([], [dropped]),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("extracts ZIP contents into a tentative selection before importing", async () => {
    const extracted = new File(["PDF"], "Extracted.pdf", {
      type: "application/pdf",
    });
    state.extractAllFiles.mockResolvedValue({
      success: true,
      extractedFiles: [extracted],
      errors: [],
    });
    const user = userEvent.setup();
    const view = show(["pdf"]);
    const archive = new File(["zip"], "Archive.zip", {
      type: "application/zip",
    });
    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: { files: [archive] },
    });
    await user.click(screen.getByRole("button", { name: "Unzip" }));
    expect(await screen.findByText("Extracted.pdf")).toBeInTheDocument();
    expect(state.selected).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledExactlyOnceWith([], [extracted]),
    );
  });
  it("restores each tab's folder and filters while keeping the cross-folder selection", async () => {
    state.folders = [folder("folder", "Invoices")];
    state.files[1] = file("two", "Two.pdf", "folder");
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Search filenames" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search filenames" }),
      "One",
    );
    await user.click(screen.getByRole("textbox", { name: "Filter by source" }));
    await user.click(await screen.findByRole("option", { name: "Local" }));
    await user.click(screen.getByText("One.pdf"));
    await user.click(
      screen.getByRole("button", { name: "Stirling library", pressed: false }),
    );
    await user.click(screen.getByText("Invoices"));
    await user.click(screen.getByRole("button", { name: "Search filenames" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search filenames" }),
      "Two",
    );
    await user.click(
      screen.getByRole("button", { name: "Recents", pressed: false }),
    );
    await user.click(screen.getByRole("button", { name: "Search filenames" }));
    expect(
      screen.getByRole("textbox", { name: "Search filenames" }),
    ).toHaveValue("One");
    expect(
      screen.getByRole("textbox", { name: "Filter by source" }),
    ).toHaveValue("Local");
    expect(screen.getByText("One.pdf")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Stirling library", pressed: false }),
    );
    await user.click(screen.getByRole("button", { name: "Search filenames" }));
    expect(
      screen.getByRole("textbox", { name: "Search filenames" }),
    ).toHaveValue("Two");
    expect(
      screen.getByRole("textbox", { name: "Filter by source" }),
    ).toHaveValue("All sources");
    expect(
      screen.getByRole("button", { name: "Invoices" }),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Two.pdf"));
    await user.click(screen.getByRole("button", { name: "Add 2 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledWith(state.files, []),
    );
    expect(state.moveFolder).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("File actions")).not.toBeInTheDocument();
  });

  it("keeps the header partially selected when the selection limit leaves eligible files unselected", async () => {
    state.maxSelectable = 2;
    state.files = Array.from({ length: 10 }, (_, i) =>
      file(`file-${i}`, `File ${i}.pdf`),
    );
    const user = userEvent.setup();
    show(["pdf"]);

    await user.click(screen.getByText("File 0.pdf"));
    await user.click(screen.getByText("File 1.pdf"));

    const header = screen.getByRole("checkbox", { name: "Select all" });
    expect(header).toBePartiallyChecked();
    expect(header).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Add 2 files" })).toBeEnabled();
    await user.click(header);
    expect(header).toBePartiallyChecked();
    await user.click(screen.getByRole("button", { name: "Add 2 files" }));
    expect(state.selected).toHaveBeenCalledWith(state.files.slice(0, 2), []);
  });

  it("counts only format-eligible files for a fully selected header", async () => {
    state.files.push(file("text", "Notes.txt"));
    const user = userEvent.setup();
    show(["pdf"]);
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(
      screen.getByRole("checkbox", { name: "Clear selection" }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Add 2 files" })).toBeEnabled();
  });

  it("enforces type restrictions and the selection limit when selecting all", async () => {
    state.maxSelectable = 1;
    state.files.push(file("text", "Notes.txt"));
    const user = userEvent.setup();
    show(["pdf"]);
    expect(
      screen.getByText("Notes.txt").closest('[role="row"]'),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByLabelText("Select all"));
    await user.click(screen.getByText("Two.pdf"));
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledWith([state.files[1]], []),
    );
  });

  it("stages imports until confirmation and discards them on cancellation", async () => {
    const user = userEvent.setup();
    const view = show();
    const upload = new File(["PDF"], "New.pdf", { type: "application/pdf" });
    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: { files: [upload] },
    });
    expect(screen.getByText("New.pdf")).toBeInTheDocument();
    expect(state.selected).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state.close).toHaveBeenCalled();
    expect(state.selected).not.toHaveBeenCalled();
    view.unmount();
    show();
    expect(screen.queryByText("New.pdf")).not.toBeInTheDocument();
  });

  it("submits a mixture of imports and library files once", async () => {
    const user = userEvent.setup();
    const view = show();
    const upload = new File(["PDF"], "New.pdf", { type: "application/pdf" });
    await user.click(screen.getByText("One.pdf"));
    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: { files: [upload] },
    });
    await user.click(screen.getByRole("button", { name: "Add 2 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledExactlyOnceWith(
        [state.files[0]],
        [upload],
      ),
    );
  });

  it("stages each file once across duplicate entries and repeated imports", async () => {
    const user = userEvent.setup();
    const view = show();
    const upload = new File(["PDF"], "Duplicate.pdf", { lastModified: 123 });
    const duplicate = new File(["PDF"], "Duplicate.pdf", { lastModified: 123 });
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [upload, duplicate] } });
    const { pendingFilePathMappings } =
      await import("@app/services/pendingFilePathMappings");
    pendingFilePathMappings.set(duplicate, "C:/Documents/Duplicate.pdf");
    fireEvent.change(input, { target: { files: [duplicate] } });

    expect(pendingFilePathMappings.has(duplicate)).toBe(false);
    expect(screen.getAllByText("Duplicate.pdf")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    expect(state.selected).toHaveBeenCalledExactlyOnceWith([], [upload]);
  });

  it("preserves a pending native path when staged files reach the editor", async () => {
    const user = userEvent.setup();
    const view = show();
    const upload = new File(["PDF"], "Native.pdf");
    const { pendingFilePathMappings } =
      await import("@app/services/pendingFilePathMappings");
    const path = Promise.resolve("C:/Documents/Native.pdf");
    pendingFilePathMappings.set(upload, path);
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [upload] } });
    fireEvent.change(input, { target: { files: [upload] } });

    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    expect(state.selected).toHaveBeenCalledExactlyOnceWith([], [upload]);
    expect(pendingFilePathMappings.get(upload)).toBe(path);
  });

  it("clears native selections from multiple folders in the selected-only view", async () => {
    state.folders = ["A", "B"].map((name) =>
      folder(name, name, { kind: "local", directory: `C:/${name}` }),
    );
    state.listDirectory.mockImplementation(async (directory: string) => ({
      files: [
        {
          path: `${directory}/File.pdf`,
          name: `${directory.slice(-1)}.pdf`,
          sizeBytes: 100,
          lastModified: 1,
        },
      ],
      directories: [],
    }));
    const user = userEvent.setup();
    show();
    await user.click(
      screen.getByRole("button", { name: "Stirling library", pressed: false }),
    );
    await user.click(screen.getByText("A", { exact: true }));
    await user.click(await screen.findByText("A.pdf"));
    expect(
      screen.getAllByRole("button", { name: "Stirling library" }),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Stirling library", pressed: true }),
    );
    await user.click(screen.getByText("B", { exact: true }));
    await user.click(await screen.findByText("B.pdf"));
    await user.click(screen.getByRole("button", { name: "2 selected" }));
    await user.click(screen.getByRole("checkbox", { name: "Clear selection" }));
    expect(screen.getByRole("button", { name: "Add 0 files" })).toBeDisabled();
  });

  it("closes before native reads finish and imports them after unmounting with their disk paths", async () => {
    state.folders = [
      folder("mount", "Documents", {
        kind: "local",
        directory: "C:/Documents",
      }),
    ];
    state.diskFiles = [
      {
        path: "C:/Documents/Disk.pdf",
        name: "Disk.pdf",
        sizeBytes: 100,
        lastModified: 1,
      },
    ];
    let finishRead!: (file: File) => void;
    state.readDiskFile.mockReturnValueOnce(
      new Promise<File>((resolve) => {
        finishRead = resolve;
      }),
    );
    const user = userEvent.setup();
    const view = show();
    await user.click(
      screen.getByRole("button", { name: "Stirling library", pressed: false }),
    );
    await user.click(screen.getByText("Documents"));
    await user.click(await screen.findByText("Disk.pdf"));
    expect(state.readDiskFile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    expect(state.close).toHaveBeenCalledTimes(1);
    expect(state.selected).not.toHaveBeenCalled();
    view.unmount();
    const diskFile = new File(["PDF"], "Disk.pdf");
    await act(async () => finishRead(diskFile));
    await waitFor(() => expect(state.selected).toHaveBeenCalled());
    expect(state.selected).toHaveBeenCalledExactlyOnceWith([], [diskFile]);
    expect(state.readDiskFile).toHaveBeenCalledWith(state.diskFiles[0]);
    const { pendingFilePathMappings } =
      await import("@app/services/pendingFilePathMappings");
    const imported = state.selected.mock.calls[0][1][0];
    expect(pendingFilePathMappings.get(imported)).toBe("C:/Documents/Disk.pdf");
  });

  it("keeps more than 50 files accessible in Recent and filters older files", async () => {
    state.files = Array.from({ length: 60 }, (_, i) => ({
      ...file(`f${i}`, `File${i}.pdf`),
      lastModified: 60 - i,
    }));
    const user = userEvent.setup();
    show();
    expect(screen.getByText("File59.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search filenames" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search filenames" }),
      "File59",
    );
    expect(await screen.findByText("File59.pdf")).toBeInTheDocument();
    expect(screen.queryByText("File0.pdf")).not.toBeInTheDocument();
  });

  it("keeps dropdown search focused through no matches and preserves its query and selection", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByText("One.pdf"));
    const trigger = screen.getByRole("button", { name: "Search filenames" });
    expect(
      screen.queryByRole("textbox", { name: "Search filenames" }),
    ).not.toBeInTheDocument();
    await user.click(trigger);
    const search = screen.getByRole("textbox", {
      name: "Search filenames",
    });
    await waitFor(() => expect(search).toHaveFocus());
    await user.type(search, "missing file");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("missing file");
    expect(screen.queryByText("One.pdf")).not.toBeInTheDocument();
    await user.clear(search);
    expect(search).toHaveFocus();
    expect(screen.getByText("One.pdf")).toBeInTheDocument();
    await user.type(search, "Two");
    const onPageKeyDown = vi.fn();
    window.addEventListener("keydown", onPageKeyDown);
    try {
      await user.keyboard("{Escape}");
      expect(onPageKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onPageKeyDown);
    }
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
      screen.queryByRole("textbox", { name: "Search filenames" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("One.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Name" }));
    await user.click(trigger);
    expect(
      screen.getByRole("textbox", { name: "Search filenames" }),
    ).toHaveValue("Two");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(
      screen.getByRole("textbox", { name: "Search filenames" }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    expect(state.selected).toHaveBeenCalledExactlyOnceWith(
      [state.files[0]],
      [],
    );
  });

  it("keeps the search when switching layouts and sorts through the compact menu", async () => {
    const user = userEvent.setup();
    const view = show();
    await user.click(screen.getByRole("button", { name: "Search filenames" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search filenames" }),
      "One",
    );
    state.viewMode = "grid";
    view.rerender(
      <MantineProvider env="test">
        <LibraryFilePicker
          onBusyChange={vi.fn()}
          onExternalPickerChange={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("textbox", { name: "Search filenames" }),
    ).toHaveValue("One");
    expect(screen.queryByText("Two.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await user.click(
      screen.getByRole("button", { name: "Sort files: Recent first" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Name Z→A" }));
    const cards = screen.getAllByRole("listitem");
    expect(cards[0]).toHaveTextContent("Two.pdf");
    expect(cards[1]).toHaveTextContent("One.pdf");
    expect(
      screen.getByRole("button", { name: "Sort files: Name Z→A" }),
    ).toBeInTheDocument();
  });

  it("uses the shared grid with keyboard selection and no management menus", async () => {
    state.viewMode = "grid";
    const user = userEvent.setup();
    show();
    const card = screen
      .getByText("One.pdf")
      .closest('[role="listitem"]') as HTMLElement;
    act(() => card.focus());
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledWith([state.files[0]], []),
    );
    expect(screen.queryByLabelText("File actions")).not.toBeInTheDocument();
  });
});
