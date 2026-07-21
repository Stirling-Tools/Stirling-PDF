import type { ComponentProps, ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileHistoryGroup from "@app/components/fileManager/FileHistoryGroup";
import { FileManagerContext } from "@app/contexts/FileManagerContext";
import { FileActionsContext } from "@app/contexts/file/contexts";
import { createFileId, StirlingFileStub } from "@app/types/fileContext";

// FileHistoryGroup renders a FileListItem per history entry, which reads
// useFileManagerContext() and useFileManagement() unconditionally — both mocks
// have to satisfy their full context shape even though only a few fields are
// actually exercised outside click handlers.
const mockFileManagerContext: ComponentProps<
  typeof FileManagerContext.Provider
>["value"] = {
  activeSource: "recent",
  storageFilter: "all",
  selectedFileIds: [],
  searchTerm: "",
  selectedFiles: [],
  filteredFiles: [],
  fileInputRef: { current: null },
  selectedFilesSet: new Set(),
  expandedFileIds: new Set(),
  fileGroups: new Map(),
  loadedHistoryFiles: new Map(),
  isLoading: false,
  activeFileIds: [],
  onSourceChange: () => {},
  onStorageFilterChange: () => {},
  onLocalFileClick: () => {},
  onFileSelect: () => {},
  onFileRemove: () => {},
  onHistoryFileRemove: () => {},
  onFileDoubleClick: () => {},
  onOpenFiles: () => {},
  onSearchChange: () => {},
  onFileInputChange: () => {},
  onSelectAll: () => {},
  onDeleteSelected: () => {},
  onDownloadSelected: () => {},
  onDownloadSingle: () => {},
  onToggleExpansion: () => {},
  onAddToRecents: () => {},
  onUnzipFile: async () => {},
  onMakeCopy: async () => {},
  onNewFilesSelect: () => {},
  onGoogleDriveSelect: () => {},
  refreshRecentFiles: async () => {},
  recentFiles: [],
  isFileSupported: () => true,
  modalHeight: "80vh",
};

const mockFileActionsContext: ComponentProps<
  typeof FileActionsContext.Provider
>["value"] = {
  actions: {
    addFiles: async () => [],
    addFilesWithOptions: async () => [],
    addStirlingFileStubs: async () => [],
    removeFiles: async () => {},
    updateStirlingFileStub: () => {},
    reorderFiles: () => {},
    clearAllFiles: async () => {},
    clearAllData: async () => {},
    pinFile: () => {},
    unpinFile: () => {},
    consumeFiles: async () => [],
    undoConsumeFiles: async () => {},
    setSelectedFiles: () => {},
    setSelectedPages: () => {},
    clearSelections: () => {},
    markFileError: () => {},
    clearFileError: () => {},
    clearAllFileErrors: () => {},
    setProcessing: () => {},
    setHasUnsavedChanges: () => {},
    resetContext: () => {},
    trackBlobUrl: () => {},
    scheduleCleanup: () => {},
    cleanupFile: () => {},
    openEncryptedUnlockPrompt: () => {},
  },
  dispatch: () => {},
};

const withMockContexts = (Story: ComponentType) => (
  <FileManagerContext.Provider value={mockFileManagerContext}>
    <FileActionsContext.Provider value={mockFileActionsContext}>
      <Story />
    </FileActionsContext.Provider>
  </FileManagerContext.Provider>
);

const originalFileId = "quarterly-report";

const leafFile: StirlingFileStub = {
  id: createFileId(),
  name: "quarterly-report.pdf",
  type: "application/pdf",
  size: 2_500_000,
  lastModified: Date.now(),
  createdAt: Date.now(),
  isLeaf: true,
  originalFileId,
  versionNumber: 3,
  toolHistory: [
    { toolId: "removePages", timestamp: Date.now() },
    { toolId: "addPassword", timestamp: Date.now() },
  ],
};

const historyFiles: StirlingFileStub[] = [
  leafFile,
  {
    ...leafFile,
    id: createFileId(),
    name: "quarterly-report.pdf",
    versionNumber: 2,
    isLeaf: false,
  },
  {
    ...leafFile,
    id: createFileId(),
    name: "quarterly-report.pdf",
    versionNumber: 1,
    isLeaf: false,
    toolHistory: undefined,
  },
];

const meta = {
  title: "FileManager/FileHistoryGroup",
  component: FileHistoryGroup,
  decorators: [withMockContexts],
} satisfies Meta<typeof FileHistoryGroup>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    leafFile,
    historyFiles,
    isExpanded: true,
    onDownloadSingle: () => {},
    onFileDoubleClick: () => {},
    onHistoryFileRemove: () => {},
  },
};

export const Collapsed: Story = {
  args: {
    ...Default.args,
    isExpanded: false,
  },
};
