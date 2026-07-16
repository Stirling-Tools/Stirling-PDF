import type { Meta, StoryObj } from "@storybook/react-vite";
import { PanAPIBridge } from "@app/components/viewer/PanAPIBridge";

const meta = {
  title: "Viewer/PanAPIBridge",
  component: PanAPIBridge,
} satisfies Meta<typeof PanAPIBridge>;
export default meta;

type Story = StoryObj<typeof meta>;

// PanAPIBridge is a headless bridge: it takes no props, renders no markup,
// and registers a pan API with ViewerContext once a document is active and
// ready. Outside a live EmbedPDF document context there is no active
// document, so the bridge bails out before touching the pan plugin — this
// verifies it mounts safely in that state.
export const Default: Story = {};
