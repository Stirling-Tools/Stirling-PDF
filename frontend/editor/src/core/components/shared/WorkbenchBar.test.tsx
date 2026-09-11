import { createContext } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import WorkbenchBar from "@app/components/shared/WorkbenchBar";
import {
  createNewStirlingFileStub,
  type StirlingFile,
} from "@app/types/fileContext";
import type { WorkbenchType } from "@app/types/workbench";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  saveAsCopy: vi.fn(),
  print: vi.fn(),
  download: vi.fn(),
  downloadRaw: vi.fn(),
  enforceExportPolicies: vi.fn(),
  alert: vi.fn(),
}));
const files = [
  createTestStirlingFile("selected.pdf"),
  createTestStirlingFile("viewed.pdf"),
];
const stubs = files.map((file) => createNewStirlingFileStub(file, file.fileId));
let selectedFiles: StirlingFile[] = [];
const viewer = { activeFileId: files[1].fileId, setActiveFileId: vi.fn() };

vi.mock("@app/contexts/ViewerContext", () => ({
  ViewerContext: createContext({
    exportActions: { saveAsCopy: mocks.saveAsCopy },
    printActions: { print: mocks.print },
  }),
  useViewer: () => viewer,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files, fileStubs: stubs }),
  useFileSelectors: () => ({
    getStirlingFileStub: (id: string) => stubs.find((stub) => stub.id === id),
  }),
  useFileSelection: () => ({
    selectedFiles,
    selectedFileIds: selectedFiles.map((file) => file.fileId),
  }),
  useFileActions: () => ({ actions: { updateStirlingFileStub: vi.fn() } }),
}));
vi.mock("@app/contexts/WorkbenchBarContext", () => ({
  useWorkbenchBar: () => ({
    buttons: [],
    actions: {},
    allButtonsDisabled: false,
  }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({ customWorkbenchViews: [] }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ selectedTool: null }),
}));
vi.mock("@app/hooks/useSharingEnabled", () => ({
  useSharingEnabled: () => ({ sharingEnabled: false }),
}));
vi.mock("@app/hooks/useSuperSearch", () => ({
  useEditorSearchScopes: () => [],
}));
vi.mock("@app/components/shared/superSearch/SuperSearch", () => ({
  default: () => null,
}));
vi.mock("@app/components/viewer/ViewerShareButton", () => ({
  default: () => null,
}));
vi.mock("@app/components/notifications/NotificationBell", () => ({
  NotificationBell: () => null,
}));
vi.mock("@app/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
  useIsPhone: () => false,
}));
vi.mock("@app/hooks/usePolicyFileBadges", () => ({
  usePolicyFileBadges: () =>
    new Map([...mocks.blocked].map((id) => [id, [{ blocked: true }]])),
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/services/exportWithPolicy", () => ({
  downloadFileWithPolicy: (...args: unknown[]) => mocks.download(...args),
}));
vi.mock("@app/services/downloadService", () => ({
  downloadFile: (...args: unknown[]) => mocks.downloadRaw(...args),
}));
vi.mock("@app/services/policyExport", () => ({
  enforceExportPolicies: (...args: unknown[]) =>
    mocks.enforceExportPolicies(...args),
}));
vi.mock("@app/components/toast", () => ({
  alert: (...args: unknown[]) => mocks.alert(...args),
}));

function bar(view: WorkbenchType = "viewer") {
  return (
    <MantineProvider env="test">
      <MemoryRouter>
        <WorkbenchBar currentView={view} setCurrentView={vi.fn()} hasFiles />
      </MemoryRouter>
    </MantineProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
  selectedFiles = [files[0]];
  mocks.saveAsCopy.mockResolvedValue(new ArrayBuffer(4));
  mocks.download.mockResolvedValue({ cancelled: false });
  mocks.downloadRaw.mockResolvedValue({ cancelled: false });
  mocks.enforceExportPolicies.mockImplementation(async (inputs: File[]) => ({
    files: inputs,
    blocked: [],
  }));
});

describe("workbench action targets", () => {
  it("exports the displayed file with its own ID even when another file is selected", async () => {
    mocks.blocked.add(files[0].fileId);
    render(bar());
    await userEvent.click(screen.getByRole("button", { name: "download" }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "viewed.pdf",
          fileId: files[1].fileId,
        }),
      ),
    );
  });

  it("disables viewer actions based on the displayed file and restores them after recovery", () => {
    const view = render(bar());
    mocks.blocked.add(files[1].fileId);
    view.rerender(bar());
    expect(screen.getByRole("button", { name: "download" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "workbenchBar.print" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "workbenchBar.closePdf" }),
    ).toBeEnabled();
    mocks.blocked.clear();
    view.rerender(bar());
    expect(screen.getByRole("button", { name: "download" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "workbenchBar.print" }),
    ).toBeEnabled();
  });

  it("blocks stale print and export clicks before reading viewer bytes", async () => {
    render(bar());
    mocks.blocked.add(files[1].fileId);
    await userEvent.click(
      screen.getByRole("button", { name: "workbenchBar.print" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "download" }));
    expect(mocks.print).not.toHaveBeenCalled();
    expect(mocks.saveAsCopy).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rechecks the viewed file after preparing the viewer export", async () => {
    mocks.saveAsCopy.mockImplementation(async () => {
      mocks.blocked.add(files[1].fileId);
      return new ArrayBuffer(4);
    });
    render(bar());
    await userEvent.click(screen.getByRole("button", { name: "download" }));
    await waitFor(() => expect(mocks.alert).toHaveBeenCalled());
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("disables Download All when any file is blocked but permits an unblocked selection", () => {
    selectedFiles = [];
    mocks.blocked.add(files[1].fileId);
    const view = render(bar("fileEditor"));
    expect(
      screen.getByRole("button", { name: "workbenchBar.downloadAll" }),
    ).toBeDisabled();
    selectedFiles = [files[0]];
    view.rerender(bar("fileEditor"));
    expect(
      screen.getByRole("button", { name: "fileManager.downloadSelected" }),
    ).toBeEnabled();
  });

  it("does not export originals when enforcement throws", async () => {
    mocks.enforceExportPolicies.mockRejectedValue(
      new Error("Enforcement unavailable"),
    );
    render(bar("fileEditor"));
    await userEvent.click(
      screen.getByRole("button", { name: "fileManager.downloadSelected" }),
    );
    await waitFor(() => expect(mocks.alert).toHaveBeenCalled());
    expect(mocks.downloadRaw).not.toHaveBeenCalled();
  });

  it("stops a batch if a file becomes blocked while saving another file", async () => {
    selectedFiles = [];
    mocks.downloadRaw.mockImplementationOnce(async () => {
      mocks.blocked.add(files[1].fileId);
      return { cancelled: false };
    });
    render(bar("fileEditor"));
    await userEvent.click(
      screen.getByRole("button", { name: "workbenchBar.downloadAll" }),
    );
    await waitFor(() => expect(mocks.alert).toHaveBeenCalled());
    expect(mocks.downloadRaw).toHaveBeenCalledOnce();
  });
});
