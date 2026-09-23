import type { Meta, StoryObj } from "@storybook/react-vite";
import ZipWarningModal from "@app/components/shared/ZipWarningModal";

const meta: Meta<typeof ZipWarningModal> = {
  title: "Shared/ZipWarningModal",
  component: ZipWarningModal,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    fileCount: 42,
    zipFileName: "large-archive.zip",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const SingleFile: Story = {
  args: {
    opened: true,
    fileCount: 1,
    zipFileName: "small-archive.zip",
    onConfirm: () => {},
    onCancel: () => {},
  },
};
