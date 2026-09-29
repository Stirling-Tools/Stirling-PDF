import type { Meta, StoryObj } from "@storybook/react-vite";
import { DownloadEditorModal } from "@portal/components/DownloadEditorModal";

const meta: Meta<typeof DownloadEditorModal> = {
  title: "Portal/DownloadEditorModal",
  component: DownloadEditorModal,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof DownloadEditorModal>;

/** Landing list of desktop + self-hosted install options. */
export const Open: Story = {};
