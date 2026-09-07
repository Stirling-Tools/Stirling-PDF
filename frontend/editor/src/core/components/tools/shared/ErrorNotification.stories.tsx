import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorNotification from "@app/components/tools/shared/ErrorNotification";

const meta = {
  title: "ToolsShared/ErrorNotification",
  component: ErrorNotification,
} satisfies Meta<typeof ErrorNotification>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    error: "Something went wrong while processing the file.",
    onClose: () => {},
  },
};

export const CustomTitle: Story = {
  args: {
    error: "The uploaded file could not be read.",
    onClose: () => {},
    title: "Upload failed",
    color: "orange",
  },
};
