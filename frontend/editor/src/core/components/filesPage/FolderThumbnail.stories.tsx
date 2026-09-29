import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";
import { FOLDER_COLOR_PALETTE } from "@app/types/folder";

const meta = {
  title: "FilesPage/FolderThumbnail",
  component: FolderThumbnail,
} satisfies Meta<typeof FolderThumbnail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    color: FOLDER_COLOR_PALETTE[4],
    fileCount: 12,
  },
};

export const RowSize: Story = {
  args: {
    color: FOLDER_COLOR_PALETTE[1],
    fileCount: 3,
    size: "row",
  },
};

export const WithIconGlyph: Story = {
  args: {
    color: FOLDER_COLOR_PALETTE[7],
    fileCount: 5,
    iconGlyph: "📄",
  },
};

export const Empty: Story = {
  args: {
    size: "thumb",
  },
};
