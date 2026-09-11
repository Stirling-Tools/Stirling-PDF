import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { FileSelectorPicker } from "@app/components/shared/FileSelectorPicker";
import { EditorSaveBar } from "@app/tools/pdfTextEditor/components/EditorSaveBar";
import { useAutoLoadFile } from "@app/tools/pdfTextEditor/hooks/useAutoLoadFile";
import PageThumbnail from "@app/components/pageEditor/PageThumbnail";
import { useUndoManagerState } from "@app/components/pageEditor/hooks/useUndoManagerState";
import { initialFileContextState } from "@app/contexts/file/FileReducer";
import {
  createNewStirlingFileStub,
  type FileContextState,
} from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  loadRecentFiles: vi.fn(),
  getStirlingFile: vi.fn(),
  setSelectedFiles: vi.fn(),
}));
const files = [
  createTestStirlingFile("blocked.pdf"),
  createTestStirlingFile("available.pdf"),
];
const stubs = files.map((file) => createNewStirlingFileStub(file, file.fileId));
const selectors = {
  getFile: (id: string) => files.find((file) => file.fileId === id),
  getStirlingFileStub: (id: string) => stubs.find((stub) => stub.id === id),
};
vi.mock("@app/contexts/FileContext", () => ({
  useFileSelector: <T,>(select: (state: FileContextState) => T) =>
    select({
      ...initialFileContextState,
      ui: {
        ...initialFileContextState.ui,
        policyBlocks: Object.fromEntries(
          [...mocks.blocked].map((id) => [id, "security"]),
        ),
      },
    }),
  useAllFiles: () => ({ files, fileStubs: stubs }),
  useFileSelection: () => ({
    selectedFiles: [files[0]],
    setSelectedFiles: mocks.setSelectedFiles,
  }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({ selectors }),
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ loadFile: vi.fn() }),
}));
vi.mock("@app/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({ openFilesModal: vi.fn() }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ selectedTool: "pdfTextEditor" }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ activeFileId: files[0].fileId }),
}));
vi.mock("@app/hooks/useFileManager", () => ({
  useFileManager: () => ({ loadRecentFiles: mocks.loadRecentFiles }),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: (...args: unknown[]) => mocks.getStirlingFile(...args),
  },
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: vi.fn().mockResolvedValue(null),
}));
vi.mock("@app/hooks/useIsMobile", () => ({ useIsMobile: () => true }));
vi.mock("@app/components/shared/PrivateContent", () => ({
  PrivateContent: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
  mocks.loadRecentFiles.mockResolvedValue(stubs);
  localStorage.clear();
});

describe("file choices for custom tools", () => {
  it("rejects a saved file whose policy fails while its bytes load", async () => {
    const savedFile = createTestStirlingFile("saved.pdf");
    const savedStub = createNewStirlingFileStub(savedFile, savedFile.fileId);
    mocks.loadRecentFiles.mockResolvedValue([savedStub]);
    mocks.getStirlingFile.mockImplementationOnce(async () => {
      mocks.blocked.add(savedFile.fileId);
      return savedFile;
    });
    const onSelect = vi.fn();
    render(
      <MantineProvider env="test">
        <FileSelectorPicker onSelect={onSelect} />
      </MantineProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "fileSelectorPicker.placeholder" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /saved.pdf/ }),
    );
    expect(mocks.getStirlingFile).toHaveBeenCalledWith(savedFile.fileId);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("dims and disables blocked files in the Compare picker, then restores them after recovery", async () => {
    const onSelect = vi.fn();
    mocks.blocked.add(files[0].fileId);
    const view = render(
      <MantineProvider env="test">
        <FileSelectorPicker onSelect={onSelect} />
      </MantineProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "fileSelectorPicker.placeholder" }),
    );
    const blocked = await screen.findByRole("button", { name: /blocked.pdf/ });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute("data-policy-blocked", "true");
    await userEvent.click(blocked);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /available.pdf/ })).toBeEnabled();
    mocks.blocked.clear();
    view.rerender(
      <MantineProvider env="test">
        <FileSelectorPicker onSelect={onSelect} />
      </MantineProvider>,
    );
    await userEvent.click(blocked);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stirlingFile: files[0] }),
    );
  });

  it("disables the text editor's save, download and blocked file switch without marking that file selected", async () => {
    const onPickFile = vi.fn();
    const onSave = vi.fn();
    const onDownload = vi.fn();
    const content = () => (
      <MantineProvider env="test">
        <EditorSaveBar
          openedFileName={files[0].name}
          currentFileId={files[0].fileId}
          dirty
          onPickFile={onPickFile}
          onSave={onSave}
          onDownload={onDownload}
        />
      </MantineProvider>
    );
    const view = render(content());
    mocks.blocked.add(files[0].fileId);
    view.rerender(content());
    const blocked = screen.getByRole("button", { name: "blocked.pdf" });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute("data-current", "false");
    expect(screen.getByTestId("pdf-editor-save")).toBeDisabled();
    expect(screen.getByTestId("pdf-editor-download")).toBeDisabled();
    await userEvent.click(blocked);
    expect(onPickFile).not.toHaveBeenCalled();
    expect(mocks.setSelectedFiles).not.toHaveBeenCalled();
    mocks.blocked.clear();
    view.rerender(content());
    expect(blocked).toBeEnabled();
    expect(screen.getByTestId("pdf-editor-save")).toBeEnabled();
  });

  it("does not auto-open or explicitly open a blocked PDF, then permits recovery", () => {
    const load = vi.fn();
    const chosen = vi.fn();
    mocks.blocked.add(files[0].fileId);
    const hook = renderHook(() =>
      useAutoLoadFile(load, chosen, null, false, {
        hasDocument: false,
        loading: false,
        error: null,
      }),
    );
    expect(load).not.toHaveBeenCalled();
    act(() => hook.result.current.openFile(files[0]));
    expect(load).not.toHaveBeenCalled();
    mocks.blocked.clear();
    hook.rerender();
    expect(load).toHaveBeenCalledWith(files[0]);
  });
});

describe("blocked page editing", () => {
  it("dims pages, clears their visible selection and prevents selection and dragging", () => {
    const onTogglePage = vi.fn();
    const props: ComponentProps<typeof PageThumbnail> = {
      page: {
        id: "page-1",
        pageNumber: 1,
        originalPageNumber: 1,
        originalFileId: files[0].fileId,
        thumbnail: null,
        rotation: 0,
        selected: true,
      },
      index: 0,
      totalPages: 1,
      fileColorIndex: 0,
      selectedPageIds: ["page-1"],
      selectionMode: true,
      movingPage: null,
      isAnimating: false,
      activeDragIds: [],
      pageRefs: { current: new Map() },
      onReorderPages: vi.fn(),
      onTogglePage,
      onAnimateReorder: vi.fn(),
      onExecuteCommand: vi.fn(),
      onSetStatus: vi.fn(),
      onSetMovingPage: vi.fn(),
      onDeletePage: vi.fn(),
      createRotateCommand: vi.fn(),
      createDeleteCommand: vi.fn(),
      createSplitCommand: vi.fn(),
      pdfDocument: {
        id: "doc",
        name: files[0].name,
        file: files[0],
        pages: [],
        totalPages: 1,
      },
      setPdfDocument: vi.fn(),
      splitPositions: new Set(),
    };
    const view = render(
      <MantineProvider env="test">
        <PageThumbnail {...props} disabled />
      </MantineProvider>,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    const page = view.container.querySelector('[data-page-id="page-1"]')!;
    expect(page).toHaveAttribute("inert");
    expect(page).toHaveStyle({ opacity: "0.45" });
    fireEvent.mouseDown(page, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(page, { clientX: 10, clientY: 10 });
    expect(onTogglePage).not.toHaveBeenCalled();
    view.rerender(
      <MantineProvider env="test">
        <PageThumbnail {...props} />
      </MantineProvider>,
    );
    expect(checkbox).toBeEnabled();
    expect(page).not.toHaveAttribute("inert");
  });

  it("guards pending page commands and undo when a source policy fails", () => {
    let blocked = false;
    const command = {
      execute: vi.fn(),
      undo: vi.fn(),
      description: "Rotate page",
    };
    const { result } = renderHook(() =>
      useUndoManagerState({
        setHasUnsavedChanges: vi.fn(),
        canEdit: () => !blocked,
      }),
    );
    act(() => result.current.executeCommandWithTracking(command));
    expect(command.execute).toHaveBeenCalledOnce();
    blocked = true;
    act(() => {
      result.current.executeCommandWithTracking(command);
      result.current.handleUndo();
    });
    expect(command.execute).toHaveBeenCalledOnce();
    expect(command.undo).not.toHaveBeenCalled();
    blocked = false;
    act(() => result.current.handleUndo());
    expect(command.undo).toHaveBeenCalledOnce();
  });
});
