import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { LibraryFilePicker } from "@app/components/filesPage/LibraryFilePicker";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FolderRecord } from "@app/types/folder";
import type { DiskFileEntry } from "@app/services/localFolderContents";

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
  moveFolder: vi.fn(),
  listDirectory: vi.fn(),
  readDiskFile: vi.fn(),
  extractAllFiles: vi.fn(),
  registerDiskSubfolders: vi.fn(),
  maxSelectable: null as number | null,
  viewMode: "list" as "list" | "grid",
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
  useAppConfig: () => ({ config: {} }),
}));
vi.mock("@app/hooks/useSharingEnabled", () => ({
  useSharingEnabled: () => ({ sharingEnabled: false }),
}));
vi.mock("@app/hooks/useGoogleDrivePicker", () => ({
  useGoogleDrivePicker: () => ({ isEnabled: false }),
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
vi.mock("@app/services/localFolderContents", () => ({
  canListDirectory: true,
  listDirectory: state.listDirectory,
  readDiskFile: state.readDiskFile,
}));
vi.mock("@app/services/zipFileService", () => ({
  zipFileService: { extractAllFiles: state.extractAllFiles },
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
const show = (supportedFormats?: string[]) =>
  render(
    <MantineProvider>
      <LibraryFilePicker
        supportedFormats={supportedFormats}
        onBusyChange={vi.fn()}
        onExternalPickerChange={vi.fn()}
      />
    </MantineProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  state.files = [file("one", "One.pdf"), file("two", "Two.pdf")];
  state.folders = [];
  state.diskFiles = [];
  state.maxSelectable = null;
  state.viewMode = "list";
  state.listDirectory.mockImplementation(async () => ({
    files: state.diskFiles,
    directories: [],
  }));
  state.readDiskFile.mockImplementation(
    async (entry: DiskFileEntry) => new File(["PDF"], entry.name),
  );
});

describe("library file picker", () => {
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
  it("keeps selections across folders without navigating the underlying library", async () => {
    state.folders = [folder("folder", "Invoices")];
    state.files[1] = file("two", "Two.pdf", "folder");
    const user = userEvent.setup();
    show();
    await user.click(screen.getByText("One.pdf"));
    await user.click(
      screen.getByRole("button", { name: "All files", pressed: false }),
    );
    await user.dblClick(screen.getByText("Invoices"));
    await user.click(screen.getByText("Two.pdf"));
    await user.click(screen.getByRole("button", { name: "Add 2 files" }));
    await waitFor(() =>
      expect(state.selected).toHaveBeenCalledWith(state.files, []),
    );
    expect(state.moveFolder).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("File actions")).not.toBeInTheDocument();
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

  it("does not read native files until Add and retains their disk paths", async () => {
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
    const user = userEvent.setup();
    show();
    await user.click(
      screen.getByRole("button", { name: "All files", pressed: false }),
    );
    await user.dblClick(screen.getByText("Documents"));
    await user.click(await screen.findByText("Disk.pdf"));
    expect(state.readDiskFile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add 1 files" }));
    await waitFor(() => expect(state.selected).toHaveBeenCalled());
    expect(state.readDiskFile).toHaveBeenCalledWith(state.diskFiles[0]);
    const { pendingFilePathMappings } =
      await import("@app/services/pendingFilePathMappings");
    expect([...pendingFilePathMappings.values()]).toContain(
      "C:/Documents/Disk.pdf",
    );
  });

  it("finds older files when searching Recent", async () => {
    state.files = Array.from({ length: 60 }, (_, i) => ({
      ...file(`f${i}`, `File${i}.pdf`),
      lastModified: 60 - i,
    }));
    const user = userEvent.setup();
    show();
    expect(screen.queryByText("File59.pdf")).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Filter files by name" }),
      "File59",
    );
    expect(await screen.findByText("File59.pdf")).toBeInTheDocument();
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
