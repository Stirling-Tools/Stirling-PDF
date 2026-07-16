import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteFilesDialog } from "@app/components/filesPage/DeleteFilesDialog";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1024,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  ...overrides,
});

const localFile = buildFileStub();
const cloudOnlyFile = buildFileStub({
  id: "server-1" as FileId,
  name: "shared-invoice.pdf",
  originalFileId: "server-1",
  remoteStorageId: 42,
  remoteOwnedByCurrentUser: true,
});

const meta = {
  title: "FilesPage/DeleteFilesDialog",
  component: DeleteFilesDialog,
  args: {
    opened: true,
    onClose: () => {},
    onConfirm: async () => {},
  },
} satisfies Meta<typeof DeleteFilesDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    files: [localFile],
  },
};

export const CloudOnly: Story = {
  args: {
    files: [cloudOnlyFile],
  },
};

export const LocalAndCloudChoice: Story = {
  args: {
    files: [localFile, cloudOnlyFile],
  },
};
