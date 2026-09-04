import type { Meta, StoryObj } from "@storybook/react-vite";
import { RedactionSelectionMenu } from "@app/components/viewer/RedactionSelectionMenu";

// RedactionSelectionMenu renders only when there is an active document ID and a selected redaction annotation.
const meta = {
  title: "Viewer/RedactionSelectionMenu",
  component: RedactionSelectionMenu,
} satisfies Meta<typeof RedactionSelectionMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
