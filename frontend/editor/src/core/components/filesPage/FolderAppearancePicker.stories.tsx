import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { FolderAppearancePicker } from "@app/components/filesPage/FolderAppearancePicker";
import { FolderRecord } from "@app/types/folder";

const folder: FolderRecord = {
  id: "folder-1" as FolderRecord["id"],
  name: "Contracts",
  parentFolderId: null,
  color: "#3b82f6",
  icon: "star",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const meta = {
  title: "FilesPage/FolderAppearancePicker",
  component: FolderAppearancePicker,
  parameters: { layout: "padded" },
  args: {
    folder,
    onChange: fn(),
  },
} satisfies Meta<typeof FolderAppearancePicker>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoAppearanceSet: Story = {
  args: {
    folder: {
      ...folder,
      color: undefined,
      icon: undefined,
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
