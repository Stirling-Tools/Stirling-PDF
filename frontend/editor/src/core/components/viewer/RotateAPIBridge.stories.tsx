import type { Meta, StoryObj } from "@storybook/react-vite";
import { RotateAPIBridge } from "@app/components/viewer/RotateAPIBridge";

const meta = {
  title: "Viewer/RotateAPIBridge",
  component: RotateAPIBridge,
} satisfies Meta<typeof RotateAPIBridge>;
export default meta;

type Story = StoryObj<typeof meta>;

// RotateAPIBridge is a headless bridge: it takes no props, renders no markup,
// and registers a rotation API with ViewerContext once a document is active
// and ready. Outside a live EmbedPDF document context there is no active
// document, so the bridge bails out before touching the rotate plugin —
// this verifies it mounts safely in that state.
export const Default: Story = {};
