import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileDetails from "@editor/components/fileManager/FileDetails";
import { FileContextProvider } from "@editor/contexts/FileContext";
import { FileManagerProvider } from "@editor/contexts/FileManagerContext";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const mockFile: StirlingFileStub = {
  id: "story-file-1" as FileId,
  name: "quarterly-report.pdf",
  type: "application/pdf",
  size: 2_400_000,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "story-file-1",
  versionNumber: 1,
  // Set so useIndexedDBThumbnail short-circuits on the stored thumbnail
  // instead of trying to read file bytes out of IndexedDB.
  thumbnailUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='160'%3E%3Crect width='120' height='160' fill='%23e9ecef'/%3E%3C/svg%3E",
};

/**
 * FileDetails reads from FileManagerContext, which itself needs FileContext
 * (for useFileActions/useFileManagement) and IndexedDBContext (pulled in by
 * FileContextProvider) further up the tree — neither is part of the shared
 * preview decorators, so both are stood up here with static mock data.
 */
function withFileManager(activeFileIds: FileId[]) {
  return (Story: () => ReactElement) => (
    <FileContextProvider>
      <FileManagerProvider
        recentFiles={[mockFile]}
        onRecentFilesSelected={() => {}}
        onNewFilesSelect={() => {}}
        onClose={() => {}}
        isFileSupported={() => true}
        isOpen
        onFileRemove={() => {}}
        modalHeight="600px"
        refreshRecentFiles={async () => {}}
        isLoading={false}
        activeFileIds={activeFileIds}
      >
        <Story />
      </FileManagerProvider>
    </FileContextProvider>
  );
}

const meta = {
  title: "FileManager/FileDetails",
  component: FileDetails,
} satisfies Meta<typeof FileDetails>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [withFileManager([mockFile.id])],
};

export const Empty: Story = {
  decorators: [withFileManager([])],
};

export const Compact: Story = {
  args: {
    compact: true,
  },
  decorators: [withFileManager([mockFile.id])],
};
