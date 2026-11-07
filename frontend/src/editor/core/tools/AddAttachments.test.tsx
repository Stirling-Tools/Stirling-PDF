import { createContext } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AddAttachments from "@editor/tools/AddAttachments";
import apiClient from "@editor/services/apiClient";
import {
  clearPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";
import {
  clearRightsManagedPdfs,
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

vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock("@editor/services/attachmentService", () => ({
  listAttachments,
  applyBatchAttachmentOps: vi.fn(),
  extractAttachments: vi.fn(),
  extractSingleAttachment: vi.fn(),
  parseBlobError: vi.fn(async () => "failed"),
}));
vi.mock("@editor/services/exportWithPolicy", () => ({
  downloadFileWithPolicy: vi.fn(),
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

async function openedPurviewPdf(name: string): Promise<StirlingFile> {
  const original = pdf(name, "%PDF-1.7 wrapper");
  const protection = JSON.stringify({
    permissions: {
      view: true,
      print: true,
      copy: true,
      edit: true,
      comment: true,
      export: true,
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
});

afterEach(() => {
  cleanup();
  clearPdfAccess();
  clearRightsManagedPdfs();
});

describe("Manage Attachments file eligibility", () => {
  test("manages the PDF it lists, not a password-protected one ahead of it", async () => {
    const locked = passwordProtectedPdf("locked.pdf");
    const plain = createTestStirlingFile("plain.pdf");
    openWorkspace([locked, plain], [locked]);

    renderTool();

    await waitFor(() => expect(listedFileNames()).toEqual(["plain.pdf"]));
    expect(await screen.findByText("plain.pdf")).toBeInTheDocument();
  });

  test("never offers a Microsoft Purview protected PDF", async () => {
    const wrapper = purviewWrapper("purview.pdf");
    const plain = createTestStirlingFile("plain.pdf");
    openWorkspace([wrapper, plain]);

    renderTool();

    await waitFor(() => expect(listedFileNames()).toEqual(["plain.pdf"]));
    expect(screen.queryByText("purview.pdf")).not.toBeInTheDocument();
  });

  test("stops offering a PDF once the session finds it is encrypted", async () => {
    const report = createTestStirlingFile("report.pdf");
    openWorkspace([report]);
    renderTool();
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();

    act(() => {
      rememberPdfAccess(report, {
        password: "",
        encrypted: true,
        signed: false,
        ownerAuthenticated: false,
        permissions: -4,
        pageCount: 1,
      });
    });

    await waitFor(() =>
      expect(screen.queryByText("report.pdf")).not.toBeInTheDocument(),
    );
  });

  test("never offers a Purview protected PDF that has been opened", async () => {
    const opened = await openedPurviewPdf("opened.pdf");
    const plain = createTestStirlingFile("plain.pdf");
    openWorkspace([opened, plain]);

    renderTool();

    await waitFor(() => expect(listedFileNames()).toEqual(["plain.pdf"]));
    expect(screen.queryByText("opened.pdf")).not.toBeInTheDocument();
  });
});
