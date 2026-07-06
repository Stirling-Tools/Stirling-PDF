import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnterpriseUpsell } from "@portal/components/billing/EnterpriseUpsell";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof EnterpriseUpsell> = {
  title: "Portal/Billing/EnterpriseUpsell",
  component: EnterpriseUpsell,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof EnterpriseUpsell>;

/** Standalone card — used on the free and subscribed billing views. */
export const Default: Story = {};

/** Bare variant — embeds in another card's column (no surface of its own). */
export const Bare: Story = { args: { bare: true } };
