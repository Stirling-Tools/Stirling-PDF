import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnnotationAPIBridge } from "@app/components/viewer/AnnotationAPIBridge";

const meta = {
  title: "Viewer/AnnotationAPIBridge",
  component: AnnotationAPIBridge,
} satisfies Meta<typeof AnnotationAPIBridge>;
export default meta;

type Story = StoryObj<typeof meta>;

// AnnotationAPIBridge is a headless bridge: it takes no props, renders no
// markup, and exposes an imperative handle wired to the EmbedPDF annotation
// capability via a ref. Outside a live EmbedPDF document context the
// capability hooks resolve to "not ready" rather than throwing, so this
// verifies the bridge mounts safely before any document is loaded.
export const Default: Story = {};
