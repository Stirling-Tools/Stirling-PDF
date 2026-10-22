import type { Meta, StoryObj } from "@storybook/react-vite";
import { RedactionPendingTracker } from "@app/components/viewer/RedactionPendingTracker";

// RedactionPendingTracker reads the active document, which defaults to null outside a live EmbedPDF session.
const meta = {
  title: "Viewer/RedactionPendingTracker",
  component: RedactionPendingTracker,
} satisfies Meta<typeof RedactionPendingTracker>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
