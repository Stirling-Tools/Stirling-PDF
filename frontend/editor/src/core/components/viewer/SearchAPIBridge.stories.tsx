import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchAPIBridge } from "@app/components/viewer/SearchAPIBridge";

const meta = {
  title: "Viewer/SearchAPIBridge",
  component: SearchAPIBridge,
} satisfies Meta<typeof SearchAPIBridge>;
export default meta;

type Story = StoryObj<typeof meta>;

// SearchAPIBridge is a headless bridge: it takes no props and renders no
// markup. It only mounts its inner component (which reads ViewerContext and
// registers the search bridge) once there's both an active document id and a
// ready document. Outside a live EmbedPDF context those resolve to null/false
// rather than throwing, so this verifies the bridge mounts safely before any
// document is loaded.
export const Default: Story = {};
