import type { Meta, StoryObj } from "@storybook/react-vite";
import { SupportingDocs } from "@portal/components/procurement/SupportingDocs";
import { buildProcurement } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const supporting = buildProcurement("enterprise").supporting;

const meta: Meta<typeof SupportingDocs> = {
  title: "Portal/Procurement/SupportingDocs",
  component: SupportingDocs,
  parameters: { layout: "padded" },
  args: { onAction: () => {} },
};
export default meta;
type Story = StoryObj<typeof SupportingDocs>;

export const Default: Story = {
  args: { groups: supporting },
};
