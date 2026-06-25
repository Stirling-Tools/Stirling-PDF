import type { Meta, StoryObj } from "@storybook/react-vite";
import { CategoryBreakdownPanel } from "@portal/components/billing/CategoryBreakdownPanel";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof CategoryBreakdownPanel> = {
  title: "Portal/Billing/CategoryBreakdownPanel",
  component: CategoryBreakdownPanel,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof CategoryBreakdownPanel>;

/** Spend split across API / AI / Automation. */
export const Mixed: Story = {
  args: {
    breakdown: { api: 900, ai: 600, automation: 750 },
    totalSpend: 2250,
  },
};

/** A single category dominating. */
export const AutomationHeavy: Story = {
  args: {
    breakdown: { api: 20, ai: 0, automation: 1800 },
    totalSpend: 1820,
  },
};
