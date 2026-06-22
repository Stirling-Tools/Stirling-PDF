import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentLedger } from "@portal/components/procurement/DocumentLedger";
import { buildProcurement } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const ledger = buildProcurement("enterprise").ledger;

const meta: Meta<typeof DocumentLedger> = {
  title: "Portal/Procurement/DocumentLedger",
  component: DocumentLedger,
  parameters: { layout: "padded" },
  args: { onAction: () => {} },
};
export default meta;
type Story = StoryObj<typeof DocumentLedger>;

export const Default: Story = {
  args: { groups: ledger },
};
