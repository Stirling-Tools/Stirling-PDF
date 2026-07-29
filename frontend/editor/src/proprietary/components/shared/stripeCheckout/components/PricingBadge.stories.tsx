import type { Meta, StoryObj } from "@storybook/react";
import { PricingBadge } from "@app/components/shared/stripeCheckout/components/PricingBadge";

/**
 * The small badge overlaid on pricing plan cards (current plan, popular, savings).
 */
const meta = {
  title: "StripeCheckout/PricingBadge",
  component: PricingBadge,
  parameters: { layout: "centered" },
  args: {
    type: "current",
    label: "Current plan",
  },
} satisfies Meta<typeof PricingBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Current: Story = {};

export const Popular: Story = {
  args: {
    type: "popular",
    label: "Most popular",
  },
};

export const Savings: Story = {
  args: {
    type: "savings",
    label: "Save 20%",
    savingsPercent: 20,
  },
};
