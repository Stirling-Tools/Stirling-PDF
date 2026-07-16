import type { Meta, StoryObj } from "@storybook/react-vite";
import { ZoomAPIBridge } from "@app/components/viewer/ZoomAPIBridge";

const meta = {
  title: "Viewer/ZoomAPIBridge",
  component: ZoomAPIBridge,
} satisfies Meta<typeof ZoomAPIBridge>;
export default meta;

type Story = StoryObj<typeof meta>;

// ZoomAPIBridge is a headless bridge that connects the PDF zoom plugin to
// ViewerContext. Without an active EmbedPDF document it renders nothing,
// so this story only verifies it mounts without throwing.
export const Default: Story = {};
