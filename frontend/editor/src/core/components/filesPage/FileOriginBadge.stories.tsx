import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileOriginBadge } from "@app/components/filesPage/FileOriginBadge";

const meta: Meta<typeof FileOriginBadge> = {
  title: "FilesPage/FileOriginBadge",
  component: FileOriginBadge,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    origin: "local",
  },
};

export const Cloud: Story = {
  args: {
    origin: "cloud",
  },
};

export const SharedWithMe: Story = {
  args: {
    origin: "shared-with-me",
  },
};

export const Compact: Story = {
  args: {
    origin: "cloud",
    compact: true,
  },
};
