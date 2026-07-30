import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteFolderDialog } from "@app/components/filesPage/DeleteFolderDialog";
import { createFolderId } from "@app/types/folder";

const mockFolder = {
  id: createFolderId(),
  name: "Invoices",
  parentFolderId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const meta = {
  title: "FilesPage/DeleteFolderDialog",
  component: DeleteFolderDialog,
} satisfies Meta<typeof DeleteFolderDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    folder: mockFolder,
    fileCount: 0,
    onClose: () => {},
    onConfirm: () => {},
  },
};

export const WithFiles: Story = {
  args: {
    opened: true,
    folder: mockFolder,
    fileCount: 12,
    onClose: () => {},
    onConfirm: () => {},
  },
};
