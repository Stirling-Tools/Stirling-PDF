import { MantineProvider } from "@mantine/core";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FileSidebar from "@editor/components/shared/FileSidebar";
import type { FileItemProps } from "@editor/components/shared/FileSidebarFileItem";
import type { FileId } from "@editor/types/file";
import type { StirlingFileStub } from "@editor/types/fileContext";

const sidebar = vi.hoisted(() => ({
  library: [] as StirlingFileStub[],
  revision: 0,
  rows: [] as FileItemProps[],
  uploadTarget: null as StirlingFileStub[] | null,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => () => {},
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@editor/components/shared/FileSidebarFileItem", () => ({
  FileItem: (props: FileItemProps) => {
    sidebar.rows.push(props);
    return <div data-testid={`row-${props.fileId}`}>{props.name}</div>;
  },
}));
vi.mock("@editor/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ loadLeafMetadata: async () => sidebar.library }),
  useIndexedDBRevision: () => sidebar.revision,
}));
vi.mock("@editor/contexts/file/fileHooks", () => ({
  useFileState: () => ({ state: { files: { ids: [], byId: {} } } }),
  useFileActions: () => ({ actions: {} }),
}));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { storageEnabled: true } }),
}));
vi.mock("@editor/hooks/useGoogleDrivePicker", () => ({
  useGoogleDrivePicker: () => ({ isEnabled: false, openPicker: vi.fn() }),
}));
vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: "viewer" }),
  useNavigationActions: () => ({ actions: { setWorkbench: vi.fn() } }),
  useNavigationGuard: () => ({ requestNavigation: vi.fn() }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ activeFileId: null, setActiveFileId: vi.fn() }),
}));
vi.mock("@editor/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: vi.fn() }),
}));
vi.mock("@editor/hooks/useAccountIdentity", () => ({
  useAccountIdentity: () => ({
    displayName: "",
    profilePictureUrl: null,
    isAnonymous: false,
  }),
}));
vi.mock("@editor/hooks/useFreeCreditsSummary", () => ({
  useFreeCreditsSummary: () => null,
}));
vi.mock("@editor/hooks/useOpenPlan", () => ({ useOpenPlan: () => null }));
vi.mock("@editor/components/shared/navFooter/NavFooter", () => ({
  NavFooter: () => null,
}));
vi.mock("@editor/components/shared/SidebarHeader", () => ({
  SidebarHeader: () => null,
}));
vi.mock("@editor/data/labelDisplay", () => ({
  useLabelName: () => (label: string) => label,
}));
vi.mock("@editor/hooks/useClassificationEnabled", () => ({
  useClassificationEnabled: () => false,
}));
vi.mock("@editor/components/shared/fileSidebarGrouping", () => ({
  FileSidebarGroupControls: () => null,
  useFileSidebarGroups: () => null,
}));
vi.mock("@editor/components/shared/BulkUploadToServerModal", () => ({
  default: (props: { files: StirlingFileStub[] }) => {
    if (props.files.length > 0) sidebar.uploadTarget = props.files;
    return null;
  },
}));
vi.mock("@editor/components/filesPage/VersionHistoryModal", () => ({
  VersionHistoryModal: () => null,
}));
vi.mock("@editor/components/filesPage/DeleteFilesDialog", () => ({
  DeleteFilesDialog: () => null,
}));
vi.mock("@editor/components/shared/RenameFileDialog", () => ({
  RenameFileDialog: () => null,
}));
vi.mock("@editor/components/shared/SidebarChecklistSlot", () => ({
  SidebarChecklistSlot: () => null,
}));
vi.mock("@editor/components/chat/SidebarChat", () => ({
  SidebarChat: () => null,
}));
vi.mock("@editor/extensions/openInNewWindow", () => ({
  useOpenInNewWindow: () => ({
    canOpenInNewWindow: () => false,
    openInNewWindow: vi.fn(),
  }),
}));
vi.mock("@editor/hooks/usePolicyFileBadges", () => ({
  usePolicyFileBadges: () => new Map(),
}));
vi.mock("@editor/components/createPdf/useCreatePdfMenu", () => ({
  useCreatePdfMenu: () => ({
    items: [],
    dialogs: null,
    stage: "idle",
    busyLabel: null,
  }),
}));
vi.mock("@editor/contexts/ToolFileEligibilityContext", () => ({
  useToolEligibleFileIds: () => null,
}));
vi.mock("@editor/components/layout/useWorkbenchFileDrop", () => ({
  useWorkbenchFileDrop: () => ({}),
}));
vi.mock("@editor/contexts/DamagedFileRepairContext", () => ({
  useDamagedFileRepair: () => null,
}));
vi.mock("@editor/contexts/FilesPageContext", () => ({
  useFilesPage: () => ({}),
}));
vi.mock("@editor/services/bulkAddProgress", () => ({
  useBulkAddProgress: () => ({ total: 0, done: 0 }),
}));
vi.mock("@editor/services/fileStorage", () => ({
  fileStorage: {},
  onRecordUnreadable: () => () => {},
}));

function stub(
  id: string,
  name: string,
  thumbnailUrl: string,
): StirlingFileStub {
  return {
    id: id as FileId,
    name,
    size: 1,
    type: "application/pdf",
    lastModified: 1,
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
    thumbnailUrl,
  };
}

const view = () => (
  <MantineProvider env="test">
    <FileSidebar />
  </MantineProvider>
);

describe("FileSidebar", () => {
  beforeEach(() => {
    sidebar.rows = [];
    sidebar.uploadTarget = null;
    sidebar.revision = 0;
    sidebar.library = [stub("a", "first.pdf", "data:image/png;base64,AAAA")];
  });

  it("hands file rows the same handlers after the library reloads, acting on the reloaded files", async () => {
    const { rerender } = render(view());
    await waitFor(() => expect(sidebar.rows.at(-1)?.name).toBe("first.pdf"));
    const before = sidebar.rows.at(-1)!;

    sidebar.library = [stub("a", "renamed.pdf", "data:image/png;base64,BBBB")];
    sidebar.revision = 1;
    rerender(view());
    await waitFor(() => expect(sidebar.rows.at(-1)?.name).toBe("renamed.pdf"));
    const after = sidebar.rows.at(-1)!;

    for (const handler of [
      "onClick",
      "onEyeClick",
      "onDelete",
      "onDownload",
      "onRename",
      "onDuplicate",
      "onSaveToCloud",
      "onVersionHistory",
    ] as const)
      expect(after[handler], handler).toBe(before[handler]);

    act(() => before.onSaveToCloud?.(before.fileId));
    expect(sidebar.uploadTarget?.map((file) => file.name)).toEqual([
      "renamed.pdf",
    ]);
  });
});
