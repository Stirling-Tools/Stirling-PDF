import type { Meta, StoryObj } from "@storybook/react-vite";
import { RedactionPendingTracker } from "@app/components/viewer/RedactionPendingTracker";

// RedactionPendingTracker reads the active document from ActiveDocumentContext, which
// defaults to `null` outside of a live EmbedPDF document-manager session (not something the
// shared preview can stub). With no active document it short-circuits and renders nothing,
// so this story only exercises that no-active-document mount path without throwing.
const meta = {
  title: "Viewer/RedactionPendingTracker",
  component: RedactionPendingTracker,
} satisfies Meta<typeof RedactionPendingTracker>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
