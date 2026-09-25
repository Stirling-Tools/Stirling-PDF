import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoveToFolderDialog } from "@app/components/filesPage/MoveToFolderDialog";
import {
  createFolderId,
  FOLDER_COLOR_PALETTE,
  FolderRecord,
} from "@app/types/folder";

const workId = createFolderId();
const invoicesId = createFolderId();
const archivedId = createFolderId();

const folders: FolderRecord[] = [
  {
    id: workId,
    name: "Work",
    parentFolderId: null,
    color: FOLDER_COLOR_PALETTE[0],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: invoicesId,
    name: "Invoices",
    parentFolderId: workId,
    color: FOLDER_COLOR_PALETTE[1],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: archivedId,
    name: "Archived",
    parentFolderId: null,
    color: FOLDER_COLOR_PALETTE[2],
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
