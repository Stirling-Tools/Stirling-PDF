import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileSourceButtons from "@app/components/fileManager/FileSourceButtons";
import { FileManagerContext } from "@app/contexts/FileManagerContext";

// FileSourceButtons only reads a handful of fields off the context, but the
// provider's value type isn't exported, so the mock below fills in every
// field with an inert default to satisfy the shape.
const mockFileManagerContextValue: ComponentProps<
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

const meta = {
  title: "FileManager/FileSourceButtons",
  component: FileSourceButtons,
  decorators: [
    (Story) => (
      <FileManagerContext.Provider value={mockFileManagerContextValue}>
        <Story />
      </FileManagerContext.Provider>
    ),
  ],
} satisfies Meta<typeof FileSourceButtons>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    horizontal: false,
  },
};

export const Horizontal: Story = {
  args: {
    horizontal: true,
  },
};

export const ActiveLocal: Story = {
  args: {
    horizontal: false,
  },
  decorators: [
    (Story) => (
      <FileManagerContext.Provider
        value={{ ...mockFileManagerContextValue, activeSource: "local" }}
      >
        <Story />
      </FileManagerContext.Provider>
    ),
  ],
};
