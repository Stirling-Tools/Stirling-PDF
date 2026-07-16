import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpreadAPIBridge } from "@app/components/viewer/SpreadAPIBridge";

const meta = {
  title: "Viewer/SpreadAPIBridge",
  component: SpreadAPIBridge,
} satisfies Meta<typeof SpreadAPIBridge>;
export default meta;

type Story = StoryObj<typeof meta>;

// SpreadAPIBridge is a headless bridge: it takes no props, renders no markup,
// and registers a spread-mode API with ViewerContext once a document is
// active and ready. Outside a live EmbedPDF document context there is no
// active document, so the bridge bails out before touching the spread
// plugin — this verifies it mounts safely in that state.
export const Default: Story = {};
