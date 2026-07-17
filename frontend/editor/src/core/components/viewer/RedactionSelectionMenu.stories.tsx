import type { Meta, StoryObj } from "@storybook/react-vite";
import { RedactionSelectionMenu } from "@app/components/viewer/RedactionSelectionMenu";

// RedactionSelectionMenu renders only when there's an active document ID
// (ActiveDocumentContext) and a selected redaction annotation from the live
// EmbedPDF redaction plugin. Neither exists in Storybook, so the component's
// own guard clause renders nothing here - that's its real empty state.
const meta = {
  title: "Viewer/RedactionSelectionMenu",
  component: RedactionSelectionMenu,
} satisfies Meta<typeof RedactionSelectionMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
