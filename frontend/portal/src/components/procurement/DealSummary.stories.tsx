import type { Meta, StoryObj } from "@storybook/react-vite";
import { DealSummary } from "@portal/components/procurement/DealSummary";
import { buildProcurement } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const deal = buildProcurement("enterprise").deal!;

const meta: Meta<typeof DealSummary> = {
  title: "Portal/Procurement/DealSummary",
  component: DealSummary,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DealSummary>;

export const Default: Story = {
  args: { deal },
};
