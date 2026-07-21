import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockFiles: StirlingFileStub[] = [
  {
    id: "file-1" as FileId,
    name: "quarterly-report.pdf",
    type: "application/pdf",
    size: 2_400_000,
    lastModified: Date.now(),
    isLeaf: true,
    originalFileId: "file-1" as FileId,
    versionNumber: 1,
  },
  {
    id: "file-2" as FileId,
    name: "invoice-march.pdf",
    type: "application/pdf",
    size: 512_000,
    lastModified: Date.now(),
    isLeaf: true,
    originalFileId: "file-2" as FileId,
    versionNumber: 1,
  },
];

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
  title: "Shared/BulkUploadToServerModal",
  component: BulkUploadToServerModal,
  decorators: [withProviders],
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof BulkUploadToServerModal>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    files: mockFiles,
  },
};

export const SingleFile: Story = {
  args: {
    opened: true,
    files: [mockFiles[0]],
  },
};
