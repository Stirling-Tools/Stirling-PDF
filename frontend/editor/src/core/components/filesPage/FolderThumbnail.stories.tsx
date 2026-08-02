import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";

const meta = {
  title: "FilesPage/FolderThumbnail",
  component: FolderThumbnail,
} satisfies Meta<typeof FolderThumbnail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    color: "#6366f1",
    fileCount: 12,
  },
};

export const RowSize: Story = {
  args: {
    color: "#22c55e",
    fileCount: 3,
    size: "row",
  },
};

export const WithIconGlyph: Story = {
  args: {
    color: "#f97316",
    fileCount: 5,
    iconGlyph: "📄",
  },
};

export const Empty: Story = {
  args: {
    size: "thumb",
  },
};
