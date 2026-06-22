import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionHeader } from "@portal/components/procurement/SectionHeader";
import "@portal/views/Procurement.css";

const meta: Meta<typeof SectionHeader> = {
  title: "Portal/Procurement/SectionHeader",
  component: SectionHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SectionHeader>;

export const Default: Story = {
  args: {
    title: "Document ledger",
    sub: "Every document this deal needs, grouped by the stage it belongs to.",
  },
};
