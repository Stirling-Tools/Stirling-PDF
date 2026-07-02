import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuoteBuilder } from "@portal/components/procurement/QuoteBuilder";
import "@portal/views/Procurement.css";

/**
 * The enterprise quote builder. The "Review quote" step calls the SaaS backend, answered here by
 * the `procurementSaas` MSW handler, so all four steps (incl. the itemised quote paper) work in
 * Storybook. Click through Volume → Commitment & service → Details → Quote.
 */
const meta: Meta<typeof QuoteBuilder> = {
  title: "Portal/Procurement/QuoteBuilder",
  component: QuoteBuilder,
  parameters: { layout: "padded" },
  args: { deployment: "cloud", onAccept: () => {} },
};
export default meta;

type Story = StoryObj<typeof QuoteBuilder>;

export const Default: Story = {};
