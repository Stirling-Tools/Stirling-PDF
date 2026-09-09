import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoveToFolderDialog } from "@app/components/filesPage/MoveToFolderDialog";
import { createFolderId, FolderRecord } from "@app/types/folder";

const workId = createFolderId();
const invoicesId = createFolderId();
const archivedId = createFolderId();

const folders: FolderRecord[] = [
  {
    id: workId,
    name: "Work",
    parentFolderId: null,
    color: "#3b82f6",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: invoicesId,
    name: "Invoices",
    parentFolderId: workId,
    color: "#10b981",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: archivedId,
    name: "Archived",
    parentFolderId: null,
    color: "#f59e0b",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const meta = {
  title: "FilesPage/MoveToFolderDialog",
  component: MoveToFolderDialog,
} satisfies Meta<typeof MoveToFolderDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    onClose: () => {},
    folders,
    onConfirm: () => {},
  },
};

export const WithDisabledDescendant: Story = {
  args: {
    opened: true,
    onClose: () => {},
    folders,
    disabledFolderId: workId,
    onConfirm: () => {},
  },
};

export const WithCreateFolder: Story = {
  args: {
    opened: true,
    onClose: () => {},
    folders,
    onConfirm: () => {},
    onCreateFolder: async (name, parentFolderId) => ({
      id: createFolderId(),
      name,
      parentFolderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  },
};

export const Empty: Story = {
  args: {
    opened: true,
    onClose: () => {},
    folders: [],
    onConfirm: () => {},
  },
};
