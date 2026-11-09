import { createContext } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AddAttachments from "@editor/tools/AddAttachments";
import apiClient from "@editor/services/apiClient";
import {
  clearPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";
import {
  clearRightsManagedPdfs,
  getOpenedRightsManagedPdf,
  openRightsManagedPdf,
} from "@editor/services/rightsManagedPdf";
import {
  createNewStirlingFileStub,
  createStirlingFile,
  type FileContextState,
  type StirlingFile,
  type StirlingFileStub,
} from "@editor/types/fileContext";
import { createTestStirlingFile } from "@editor/tests/utils/testFileHelpers";

const workspace = {
  files: [] as StirlingFile[],
  fileStubs: [] as StirlingFileStub[],
};
const selectors = {
  getStirlingFileStub: (id: string) =>
    workspace.fileStubs.find((stub) => stub.id === id),
};
const listAttachments = vi.hoisted(() => vi.fn());
const extractAttachments = vi.hoisted(() => vi.fn());
const downloadFileWithPolicy = vi.hoisted(() => vi.fn());

vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock("@editor/services/attachmentService", () => ({
  listAttachments,
  applyBatchAttachmentOps: vi.fn(),
  extractAttachments,
  extractSingleAttachment: vi.fn(),
  parseBlobError: vi.fn(async () => "failed"),
}));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  inspectLocalPdfAccess: vi.fn(async () => ({ signed: false })),
}));
vi.mock("@editor/services/exportWithPolicy", () => ({
  downloadFileWithPolicy,
}));
vi.mock("@editor/utils/thumbnailUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@editor/utils/thumbnailUtils")>()),
  generateThumbnailForFile: vi.fn(async () => ""),
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useAllFiles: () => ({
    ...workspace,
    fileIds: workspace.files.map((file) => file.fileId),
  }),
  useFileContext: () => ({ selectors, actions: {} }),
  useFileSelectors: () => selectors,
  useFileSelector: <T,>(select: (state: FileContextState) => T) =>
    select({ files: { ids: [], byId: {} } } as unknown as FileContextState),
  useFileActions: () => ({ actions: {} }),
  useFileSelection: () => ({ setSelectedFiles: vi.fn() }),
  useFileManagement: () => ({ reorderFiles: vi.fn() }),
}));
vi.mock("@editor/contexts/file/fileHooks", () => ({
  useFileContext: () => ({ addFiles: vi.fn() }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  ViewerContext: createContext(null),
  useViewer: () => ({ activeFileIndex: 0 }),
}));
vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: "fileEditor" }),
  useNavigationActions: () => ({ actions: {} }),
}));
vi.mock("@editor/contexts/ToolWorkflowContext", () => ({
  useToolWorkflowActions: () => ({ handleToolSelect: vi.fn() }),
  useToolWorkflow: () => ({ selectedTool: null }),
}));
vi.mock("@editor/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: {} }),
}));
vi.mock("@editor/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({}),
}));
vi.mock("@editor/hooks/useFileManager", () => ({
  useFileManager: () => ({ loadRecentFiles: async () => [] }),
}));
vi.mock("@editor/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => ({ enabled: true, loading: false }),
}));
vi.mock("@editor/hooks/useBackendHealth", () => ({
  useBackendHealth: () => ({ isOnline: true }),
}));
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(options?.[name]),
      ),
  }),
}));

function pdf(name: string, content: string): StirlingFile {
  return createStirlingFile(
    new File([content], name, { type: "application/pdf" }),
  );
}

function passwordProtectedPdf(name: string): StirlingFile {
  const file = pdf(name, "%PDF-1.7 encrypted");
  rememberPdfAccess(file, {
    password: "",
    encrypted: true,
    signed: false,
    ownerAuthenticated: false,
    permissions: -4,
    pageCount: 1,
  });
  return file;
}

function purviewWrapper(name: string): StirlingFile {
  const bytes = new TextEncoder().encode(
    "%PDF-2.0\n<< /AF [<< /AFRelationship /EncryptedPayload /EP << /Subtype /MicrosoftIRMServices >> >>] >>",
  );
  const file = new File([bytes], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    writable: true,
    value: async () => bytes.buffer.slice(0),
  });
  return createStirlingFile(file);
}

async function openedPurviewPdf(
  name: string,
  edit = true,
  exportRight = true,
): Promise<StirlingFile> {
  const original = pdf(name, "%PDF-1.7 wrapper");
  const protection = JSON.stringify({
    permissions: {
      view: true,
      print: true,
      copy: true,
      edit,
      comment: true,
      export: exportRight,
      owner: false,
    },
  });
  vi.mocked(apiClient.post).mockResolvedValueOnce({
    data: new Blob(["%PDF-1.7 plaintext"]),
    headers: {
      "x-stirling-protection": btoa(protection)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, ""),
    },
  });
  await openRightsManagedPdf(original, 7);
  return original;
}

function openWorkspace(files: StirlingFile[], encrypted: StirlingFile[] = []) {
  workspace.files = files;
  workspace.fileStubs = files.map((file) => {
    const stub = createNewStirlingFileStub(file, file.fileId);
    if (encrypted.includes(file))
      stub.processedFile = { pages: [], isEncrypted: true };
    return stub;
  });
}

function listedFileNames(): string[] {
  return listAttachments.mock.calls.map(([file]) => (file as File).name);
}

function renderTool() {
  return render(
    <MantineProvider>
      <AddAttachments />
    </MantineProvider>,
  );
}

beforeEach(() => {
  listAttachments.mockReset();
  listAttachments.mockResolvedValue([]);
  extractAttachments.mockReset();
  downloadFileWithPolicy.mockReset();
});

afterEach(() => {
  cleanup();
  clearPdfAccess();
  clearRightsManagedPdfs();
});

describe("Manage Attachments file eligibility", () => {
  test("offers a password-protected PDF, since its edits keep the password", async () => {
    const locked = passwordProtectedPdf("locked.pdf");
    const plain = createTestStirlingFile("plain.pdf");
    openWorkspace([locked, plain], [locked]);

    renderTool();

    expect(await screen.findByText(/2 files/)).toBeInTheDocument();
  });

  test("never offers a Microsoft Purview protected PDF", async () => {
    const wrapper = purviewWrapper("purview.pdf");
    const plain = createTestStirlingFile("plain.pdf");
    openWorkspace([wrapper, plain]);

    renderTool();

    await waitFor(() => expect(listedFileNames()).toEqual(["plain.pdf"]));
    expect(screen.queryByText("purview.pdf")).not.toBeInTheDocument();
  });

  test("offers an opened Purview protected PDF and lists its decrypted document", async () => {
    const opened = await openedPurviewPdf("opened.pdf");
    openWorkspace([opened]);

    renderTool();

    await waitFor(() => expect(listedFileNames()).toEqual(["opened.pdf"]));
    expect(listAttachments.mock.calls[0][0]).toBe(
      getOpenedRightsManagedPdf(opened)?.plaintext,
    );
  });

  test("never offers an opened Purview protected PDF the account can only view", async () => {
    const viewOnly = await openedPurviewPdf("view-only.pdf", false);
    const plain = createTestStirlingFile("plain.pdf");
    openWorkspace([viewOnly, plain]);

    renderTool();

    await waitFor(() => expect(listedFileNames()).toEqual(["plain.pdf"]));
    expect(screen.queryByText("view-only.pdf")).not.toBeInTheDocument();
  });
});

describe("Manage Attachments downloads on Purview protected PDFs", () => {
  test("extracts the attachments of the decrypted document when the export right is granted", async () => {
    const opened = await openedPurviewPdf("exportable.pdf");
    listAttachments.mockResolvedValue([{ filename: "minutes.txt", size: 3 }]);
    extractAttachments.mockResolvedValue(new Blob(["zip"]));
    openWorkspace([opened]);

    renderTool();

    const extractAll = await screen.findByRole("button", {
      name: "Extract all",
    });
    expect(extractAll).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Download attachment" }),
    ).toBeEnabled();
    fireEvent.click(extractAll);

    await waitFor(() =>
      expect(downloadFileWithPolicy).toHaveBeenCalledWith(
        expect.objectContaining({ filename: "exportable_attachments.zip" }),
      ),
    );
    expect(extractAttachments.mock.calls[0][0]).toBe(
      getOpenedRightsManagedPdf(opened)?.plaintext,
    );
  });

  test("disables downloads and says why without the export right", async () => {
    const opened = await openedPurviewPdf("no-export.pdf", true, false);
    listAttachments.mockResolvedValue([{ filename: "minutes.txt", size: 3 }]);
    openWorkspace([opened]);

    renderTool();

    const extractAll = await screen.findByRole("button", {
      name: "Extract all",
    });
    const download = screen.getByRole("button", {
      name: "Download attachment",
    });
    expect(extractAll).toBeDisabled();
    expect(download).toBeDisabled();
    expect(download).toHaveAccessibleDescription(
      "Your Microsoft Purview permissions do not allow saving copies of this PDF's attachments.",
    );
    fireEvent.click(extractAll);
    expect(extractAttachments).not.toHaveBeenCalled();
    expect(screen.queryByText(/doesn't make PDFs/)).not.toBeInTheDocument();
  });
});
