import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextSelectionHandler } from "@app/components/viewer/TextSelectionHandler";

const meta = {
  title: "Viewer/TextSelectionHandler",
  component: TextSelectionHandler,
} satisfies Meta<typeof TextSelectionHandler>;
export default meta;

type Story = StoryObj<typeof meta>;

// Renders headless (returns null) — there is no EmbedPDF document/plugin context
// in this preview, so the handler's effect no-ops without a selection plugin to
// attach to. The story just verifies the component mounts and unmounts cleanly.
export const Default: Story = {
  args: {
    documentId: "doc-1",
    pageIndex: 0,
  },
};
