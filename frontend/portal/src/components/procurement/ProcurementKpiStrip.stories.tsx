import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcurementKpiStrip } from "@portal/components/procurement/ProcurementKpiStrip";
import { buildProcurement } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const ent = buildProcurement("enterprise");

const meta: Meta<typeof ProcurementKpiStrip> = {
  title: "Portal/Procurement/ProcurementKpiStrip",
  component: ProcurementKpiStrip,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ProcurementKpiStrip>;

export const Default: Story = {
  args: { deal: ent.deal!, journey: ent.journey, ledger: ent.ledger },
};
