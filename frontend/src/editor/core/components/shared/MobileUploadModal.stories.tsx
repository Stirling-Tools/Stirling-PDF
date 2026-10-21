import type { Meta, StoryObj } from "@storybook/react-vite";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";

const meta: Meta<typeof MobileUploadModal> = {
  title: "Shared/MobileUploadModal",
  component: MobileUploadModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    onFilesReceived: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** QR code + instructions for scanning a file upload session from a phone. */
export const Default: Story = {};

/** Closed state — modal renders nothing visible. */
export const Closed: Story = {
  args: {
    opened: false,
  },
};
