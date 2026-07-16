import type { ComponentProps, ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileInfoCard from "@app/components/fileManager/FileInfoCard";
import { FileManagerContext } from "@app/contexts/FileManagerContext";
import { createFileId, StirlingFileStub } from "@app/types/fileContext";

// FileInfoCard only reads `onMakeCopy` off the context, but the value is
// fully typed, so the mock has to satisfy the whole shape.
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

const withFileManagerContext = (Story: ComponentType) => (
  <FileManagerContext.Provider value={mockFileManagerContext}>
    <Story />
  </FileManagerContext.Provider>
);

const localFile: StirlingFileStub = {
  id: createFileId(),
  name: "quarterly-report.pdf",
  type: "application/pdf",
  size: 2_500_000,
  lastModified: Date.now(),
  createdAt: Date.now(),
  isLeaf: true,
  originalFileId: "quarterly-report",
  versionNumber: 2,
  toolHistory: [
    { toolId: "removePages", timestamp: Date.now() },
    { toolId: "addPassword", timestamp: Date.now() },
  ],
};

const cloudFile: StirlingFileStub = {
  ...localFile,
  id: createFileId(),
  name: "signed-contract.pdf",
  remoteStorageId: "remote-file-123",
  remoteStorageUpdatedAt: Date.now(),
  remoteOwnedByCurrentUser: true,
};

const meta = {
  title: "FileManager/FileInfoCard",
  component: FileInfoCard,
  decorators: [withFileManagerContext],
} satisfies Meta<typeof FileInfoCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    currentFile: null,
    modalHeight: "80vh",
  },
};

export const WithFile: Story = {
  args: {
    currentFile: localFile,
    modalHeight: "80vh",
  },
};

export const CloudFile: Story = {
  args: {
    currentFile: cloudFile,
    modalHeight: "80vh",
  },
};
