import type { Meta, StoryObj } from "@storybook/react-vite";
import { RedactionSelectionMenu } from "@app/components/viewer/RedactionSelectionMenu";

// RedactionSelectionMenu only renders once it has an active document ID
// (from ActiveDocumentContext) and a selected redaction annotation from the
// live EmbedPDF redaction plugin. Neither is available outside the real PDF
// viewer runtime, so outside that context the component's own guard clause
// makes it render nothing - which is its accurate default/empty state here.
const meta = {
  title: "Viewer/RedactionSelectionMenu",
  component: RedactionSelectionMenu,
} satisfies Meta<typeof RedactionSelectionMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
