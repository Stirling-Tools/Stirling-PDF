import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { FileItem } from "@app/components/shared/FileSidebarFileItem";
import WorkbenchBarDesktopActions from "@app/components/shared/workbenchBar/WorkbenchBarDesktopActions";
import WorkbenchBarMobileActions from "@app/components/shared/workbenchBar/WorkbenchBarMobileActions";
import type { WorkbenchBarActionsProps } from "@app/components/shared/workbenchBar/types";
import ViewerShareButton from "@app/components/viewer/ViewerShareButton";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  uploadHistoryChain: vi.fn(),
  uploadHistoryChains: vi.fn(),
  alert: vi.fn(),
}));
const file = createTestStirlingFile("report.pdf");
const stub = createNewStirlingFileStub(file, file.fileId);
const blockedPolicy = {
  id: "security",
  name: "Security",
  accentColor: "var(--c-primary)",
  blocked: true,
};

vi.mock("@app/hooks/useLazyThumbnail", () => ({
  useLazyThumbnail: () => undefined,
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ activeFileId: file.fileId }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: [stub] }),
  useFileActions: () => ({ actions: { updateStirlingFileStub: vi.fn() } }),
}));
vi.mock("@app/hooks/usePolicyFileBadges", () => ({
  usePolicyFileBadges: () =>
    new Map([...mocks.blocked].map((id) => [id, [blockedPolicy]])),
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/services/serverStorageUpload", () => ({
  uploadHistoryChain: (...args: unknown[]) => mocks.uploadHistoryChain(...args),
  uploadHistoryChains: (...args: unknown[]) =>
    mocks.uploadHistoryChains(...args),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { updateFileMetadata: vi.fn() },
}));
vi.mock("@app/components/toast", () => ({
  alert: (...args: unknown[]) => mocks.alert(...args),
}));
vi.mock("@app/components/shared/ShareManagementModal", () => ({
  default: ({ opened }: { opened: boolean }) =>
    opened ? <div role="dialog">Sharing controls</div> : null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
  stub.remoteStorageId = undefined;
});

describe("sidebar policy actions", () => {
  it("disables byte actions in an already open menu and restores them after recovery", async () => {
    const onDownload = vi.fn();
    const onDuplicate = vi.fn();
    const onSaveToCloud = vi.fn();
    const row = (blocked: boolean) => (
      <MantineProvider env="test">
        <FileItem
          fileId={file.fileId}
          name={file.name}
          isSelected={false}
          isActive
          isViewedInViewer={false}
          policies={blocked ? [blockedPolicy] : []}
          onClick={vi.fn()}
          onEyeClick={vi.fn()}
          onDownload={onDownload}
          onDuplicate={onDuplicate}
          onSaveToCloud={onSaveToCloud}
          canSaveToCloud
          onDelete={vi.fn()}
          onRename={vi.fn()}
        />
      </MantineProvider>
    );
    const view = render(row(false));
    await userEvent.click(
      screen.getByRole("button", { name: "fileSidebar.fileItem.moreActions" }),
    );
    const download = await screen.findByRole("menuitem", { name: "download" });
    expect(download).toBeEnabled();
    view.rerender(row(true));
    for (const name of [
      "download",
      "fileSidebar.fileItem.duplicate",
      "fileSidebar.fileItem.uploadToServer",
    ]) {
      const item = screen.getByRole("menuitem", { name });
      expect(item).toBeDisabled();
      await userEvent.click(item);
    }
    expect(onDownload).not.toHaveBeenCalled();
    expect(onDuplicate).not.toHaveBeenCalled();
    expect(onSaveToCloud).not.toHaveBeenCalled();
    expect(
      screen.getByRole("menuitem", { name: "fileSidebar.fileItem.delete" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("menuitem", {
        name: "fileSidebar.fileItem.openInViewer",
      }),
    ).toBeEnabled();
    view.rerender(row(false));
    await userEvent.click(download);
    expect(onDownload).toHaveBeenCalledWith(file.fileId);
  });
});

describe.each([
  ["desktop", WorkbenchBarDesktopActions],
  ["mobile", WorkbenchBarMobileActions],
] as const)("%s toolbar", (mode, Actions) => {
  it("disables print, download and save-as on failure while keeping Close available", async () => {
    const props: WorkbenchBarActionsProps = {
      currentView: "viewer",
      isCustomView: false,
      actionsDisabled: false,
      policyEnforcing: false,
      policyBlocked: false,
      downloadLabel: "Download",
      downloadIconName: "download",
      saveAsIconName: "save",
      onPrint: vi.fn(),
      onExport: vi.fn(),
      onClose: vi.fn(),
    };
    const view = render(
      <MantineProvider env="test">
        <Actions {...props} />
      </MantineProvider>,
    );
    if (mode === "mobile")
      await userEvent.click(
        screen.getByRole("button", { name: "workbenchBar.moreActions" }),
      );
    const role = mode === "mobile" ? "menuitem" : "button";
    expect(await screen.findByRole(role, { name: "Download" })).toBeEnabled();
    view.rerender(
      <MantineProvider env="test">
        <Actions {...props} policyBlocked />
      </MantineProvider>,
    );
    for (const name of [
      "workbenchBar.print",
      "Download",
      "workbenchBar.saveAs",
    ]) {
      const button = screen.getByRole(role, { name });
      expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    expect(props.onPrint).not.toHaveBeenCalled();
    expect(props.onExport).not.toHaveBeenCalled();
    expect(
      screen.getByRole(role, { name: "workbenchBar.closePdf" }),
    ).toBeEnabled();
    view.rerender(
      <MantineProvider env="test">
        <Actions {...props} />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole(role, { name: "Download" }));
    expect(props.onExport).toHaveBeenCalledOnce();
  });
});

describe("upload and share dialogs", () => {
  it("disables an open upload dialog after failure and restores it after recovery", async () => {
    const content = (
      <MantineProvider env="test">
        <BulkUploadToServerModal opened files={[stub]} onClose={vi.fn()} />
      </MantineProvider>
    );
    const view = render(content);
    expect(
      screen.getByRole("button", { name: "storageUpload.uploadButton" }),
    ).toBeEnabled();
    mocks.blocked.add(stub.id);
    view.rerender(
      <MantineProvider env="test">
        <BulkUploadToServerModal opened files={[stub]} onClose={vi.fn()} />
      </MantineProvider>,
    );
    const upload = screen.getByRole("button", {
      name: "storageUpload.uploadButton",
    });
    expect(upload).toBeDisabled();
    expect(screen.getByText("policy.blockedBody")).toBeVisible();
    await userEvent.click(upload);
    expect(mocks.uploadHistoryChains).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "cancel" })).toBeEnabled();
    mocks.blocked.clear();
    view.rerender(content);
    expect(upload).toBeEnabled();
  });

  it("guards upload when failure arrives before the UI rerenders", async () => {
    render(
      <MantineProvider env="test">
        <BulkUploadToServerModal opened files={[stub]} onClose={vi.fn()} />
      </MantineProvider>,
    );
    mocks.blocked.add(stub.id);
    await userEvent.click(
      screen.getByRole("button", { name: "storageUpload.uploadButton" }),
    );
    expect(mocks.uploadHistoryChains).not.toHaveBeenCalled();
  });

  it("disables Share and its open save confirmation after a policy fails", async () => {
    const view = render(
      <MantineProvider env="test">
        <ViewerShareButton />
      </MantineProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "workbenchBar.share" }),
    );
    expect(
      await screen.findByRole("button", { name: "storageShare.saveAndShare" }),
    ).toBeEnabled();
    mocks.blocked.add(stub.id);
    view.rerender(
      <MantineProvider env="test">
        <ViewerShareButton />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("button", { name: "storageShare.saveAndShare" }),
    ).toBeDisabled();
    expect(screen.getByText("policy.blockedBody")).toBeVisible();
    expect(screen.getByRole("button", { name: "cancel" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "workbenchBar.share" }),
      ).toBeDisabled(),
    );
    expect(mocks.uploadHistoryChain).not.toHaveBeenCalled();
  });

  it("dismisses existing sharing controls on failure and doesn't reopen them after recovery", async () => {
    stub.remoteStorageId = 42;
    const view = render(
      <MantineProvider env="test">
        <ViewerShareButton />
      </MantineProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "workbenchBar.share" }),
    );
    expect(screen.getByText("Sharing controls")).toBeVisible();
    mocks.blocked.add(stub.id);
    view.rerender(
      <MantineProvider env="test">
        <ViewerShareButton />
      </MantineProvider>,
    );
    expect(screen.queryByText("Sharing controls")).not.toBeInTheDocument();
    mocks.blocked.clear();
    view.rerender(
      <MantineProvider env="test">
        <ViewerShareButton />
      </MantineProvider>,
    );
    expect(screen.queryByText("Sharing controls")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "workbenchBar.share" }),
    ).toBeEnabled();
  });
});
