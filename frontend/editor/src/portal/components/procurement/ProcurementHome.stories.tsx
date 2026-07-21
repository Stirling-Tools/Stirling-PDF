import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcurementHome } from "@portal/components/procurement/ProcurementHome";

/**
 * The end-to-end procurement experience (Home hero + takeover modal), driven by the `procurementSaas`
 * MSW handlers: start trial → build quote → generate (issue Stripe Quote) → milestone (download PDF /
 * accept). `autoOpen` opens the modal so the flow is immediately clickable.
 */
const meta: Meta<typeof ProcurementHome> = {
  title: "Portal/Procurement/ProcurementHome",
  component: ProcurementHome,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof ProcurementHome>;

export const Default: Story = { args: { autoOpen: true } };
