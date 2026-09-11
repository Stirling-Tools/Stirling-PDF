import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import PdfTextEditor from "@app/tools/pdfTextEditor/PdfTextEditor";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  exportToBlob: vi.fn(),
  createFiles: vi.fn(),
  consumeFiles: vi.fn(),
  download: vi.fn(),
  setError: vi.fn(),
  markSaved: vi.fn(),
}));
const source = createTestStirlingFile("source.pdf");
const output = createTestStirlingFile("edited.pdf");
const sourceStub = createNewStirlingFileStub(source, source.fileId);
const outputStub = createNewStirlingFileStub(output, output.fileId);
const state = {
  hasDocument: true,
  dirty: true,
  pages: [],
  sourceFileId: source.fileId,
  loading: false,
  error: null,
};
const store = {
  document: {},
  selection: { value: { runIds: [], imageIds: [] }, subscribe: () => () => {} },
  getState: () => state,
  savedPosition: () => null,
  markSaved: mocks.markSaved,
  setError: mocks.setError,
  setSourceFileId: (id: typeof source.fileId) => {
    state.sourceFileId = id;
  },
};
vi.mock("@app/tools/pdfTextEditor/hooks/useEditorStore", () => ({
  useEditorStore: () => ({ store, state }),
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useDocumentLoader", () => ({
  useDocumentLoader: () => vi.fn(),
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useAutoLoadFile", () => ({
  useAutoLoadFile: (
    _load: unknown,
    onFileChosen: (name: string, fileId: typeof output.fileId) => void,
  ) => ({
    openFile: () => onFileChosen(output.name, output.fileId),
    adopt: vi.fn(),
  }),
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useWorkbenchPin", () => ({
  useWorkbenchPin: () => vi.fn(),
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useUnsavedChangesGuard", () => ({
  useUnsavedChangesGuard: () => {},
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useEditorTestGlobal", () => ({
  useEditorTestGlobal: () => {},
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useSelectionActions", () => ({
  useSelectionActions: () => ({}),
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useEditorKeyboardShortcuts", () => ({
  useEditorKeyboardShortcuts: () => {},
}));
vi.mock("@app/tools/pdfTextEditor/hooks/useEditorClipboard", () => ({
  useEditorClipboard: () => {},
}));
vi.mock("@app/tools/pdfTextEditor/components/EditorSidebar", () => ({
  EditorSidebar: () => null,
}));
vi.mock("@app/tools/pdfTextEditor/components/PageStage", () => ({
  PageStage: () => null,
}));
vi.mock("@app/tools/pdfTextEditor/components/HelpOverlay", () => ({
  HelpOverlay: () => null,
}));
vi.mock("@app/tools/pdfTextEditor/components/SaveRiskModal", () => ({
  SaveRiskModal: () => null,
}));
vi.mock("@app/tools/pdfTextEditor/components/PasswordPromptModal", () => ({
  PasswordPromptModal: () => null,
}));
vi.mock("@app/tools/pdfTextEditor/components/EditorSaveBar", () => ({
  EditorSaveBar: ({
    onSave,
    onDownload,
    onPickFile,
  }: {
    onSave: () => void;
    onDownload: () => void;
    onPickFile: (file: File) => void;
  }) => (
    <>
      <button onClick={onSave}>Save</button>
      <button onClick={onDownload}>Download</button>
      <button onClick={() => onPickFile(output)}>Choose replacement</button>
    </>
  ),
}));
vi.mock("@app/tools/pdfTextEditor/util/documentRisks", () => ({
  detectSaveRisks: () => ({}),
  hasSaveRisks: () => false,
}));
vi.mock("@app/tools/pdfTextEditor/util/fallbackFont", () => ({
  preloadFallbackFontBytes: vi.fn(),
}));
vi.mock("@app/tools/pdfTextEditor/util/exportPdf", () => ({
  exportToBlob: (...args: unknown[]) => mocks.exportToBlob(...args),
}));
vi.mock("@app/services/fileStubHelpers", () => ({
  createStirlingFilesAndStubs: (...args: unknown[]) =>
    mocks.createFiles(...args),
}));
vi.mock("@app/services/exportWithPolicy", () => ({
  downloadFileWithPolicy: (...args: unknown[]) => mocks.download(...args),
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/hooks/useBlockedFiles", () => ({ useBlockedFiles: () => [] }));
vi.mock("@app/components/shared/PolicyBlockedNotice", () => ({
  PolicyBlockedNotice: () => null,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileContext: () => ({
    addFiles: vi.fn(),
    consumeFiles: mocks.consumeFiles,
    selectors: { getStirlingFileStub: () => sourceStub },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
  state.sourceFileId = source.fileId;
  mocks.exportToBlob.mockResolvedValue({ blob: output, filename: output.name });
  mocks.createFiles.mockResolvedValue({
    stirlingFiles: [output],
    stubs: [outputStub],
  });
  mocks.download.mockResolvedValue({ cancelled: false });
});

describe("PDF text editor policy saves", () => {
  it("keeps the loaded source blocked until a replacement document actually loads", async () => {
    render(
      <MantineProvider env="test">
        <PdfTextEditor />
      </MantineProvider>,
    );
    mocks.blocked.add(source.fileId);
    await userEvent.click(
      screen.getByRole("button", { name: "Choose replacement" }),
    );
    expect(state.sourceFileId).toBe(source.fileId);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.exportToBlob).not.toHaveBeenCalled();
  });

  it("blocks stale save clicks before serialization", async () => {
    render(
      <MantineProvider env="test">
        <PdfTextEditor />
      </MantineProvider>,
    );
    mocks.blocked.add(source.fileId);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.exportToBlob).not.toHaveBeenCalled();
    expect(mocks.consumeFiles).not.toHaveBeenCalled();
    expect(mocks.markSaved).not.toHaveBeenCalled();
  });

  it.each(["serialization", "metadata"])(
    "preserves edits when a policy fails during %s",
    async (stage) => {
      if (stage === "serialization")
        mocks.exportToBlob.mockImplementationOnce(async () => {
          mocks.blocked.add(source.fileId);
          return { blob: output, filename: output.name };
        });
      else
        mocks.createFiles.mockImplementationOnce(async () => {
          mocks.blocked.add(source.fileId);
          return { stirlingFiles: [output], stubs: [outputStub] };
        });
      render(
        <MantineProvider env="test">
          <PdfTextEditor />
        </MantineProvider>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Download" }));
      await waitFor(() =>
        expect(mocks.setError).toHaveBeenCalledWith(expect.any(String)),
      );
      expect(mocks.consumeFiles).not.toHaveBeenCalled();
      expect(mocks.download).not.toHaveBeenCalled();
      expect(mocks.markSaved).not.toHaveBeenCalled();
    },
  );

  it("saves to the original source and runs download enforcement on the replacement ID", async () => {
    render(
      <MantineProvider env="test">
        <PdfTextEditor />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalled());
    expect(mocks.consumeFiles).toHaveBeenCalledWith(
      [source.fileId],
      [output],
      [outputStub],
    );
    expect(mocks.download).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: output.fileId }),
    );
    expect(mocks.markSaved).toHaveBeenCalledOnce();
  });
});
