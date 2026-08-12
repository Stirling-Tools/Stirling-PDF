import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import UploadToServerModal from "@app/components/shared/UploadToServerModal";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockFile: StirlingFileStub = {
  id: "file-1" as FileId,
  name: "quarterly-report.pdf",
  type: "application/pdf",
  size: 2_400_000,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "file-1" as FileId,
  versionNumber: 1,
};

const mockUploadedFile: StirlingFileStub = {
  ...mockFile,
  id: "file-2" as FileId,
  originalFileId: "file-2" as FileId,
  remoteStorageId: 2,
};

/**
 * The modal dispatches updateStirlingFileStub on upload, so it needs
 * FileContext (also supplies IndexedDBContext) mounted above it.
 */
function withProviders(Story: () => ReactElement) {
  return (
    <FileContextProvider>
      <Story />
    </FileContextProvider>
  );
}

const meta = {
  title: "Shared/UploadToServerModal",
  component: UploadToServerModal,
  decorators: [withProviders],
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof UploadToServerModal>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    file: mockFile,
  },
};

export const AlreadyUploaded: Story = {
  args: {
    opened: true,
    file: mockUploadedFile,
  },
};
