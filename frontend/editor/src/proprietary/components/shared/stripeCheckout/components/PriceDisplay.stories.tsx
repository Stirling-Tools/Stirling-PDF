import type { Meta, StoryObj } from "@storybook/react-vite";
import { PriceDisplay } from "@app/components/shared/stripeCheckout/components/PriceDisplay";

/**
 * Renders a plan's price, either a simple single price or an enterprise
 * base/seat/total breakdown.
 */
const meta = {
  title: "StripeCheckout/PriceDisplay",
  component: PriceDisplay,
  parameters: { layout: "centered" },
} satisfies Meta<typeof PriceDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
  args: {
    mode: "simple",
    price: 999,
    currency: "usd",
    period: "per month",
  },
};

export const Enterprise: Story = {
  args: {
    mode: "enterprise",
    basePrice: 4999,
    seatPrice: 1500,
    currency: "usd",
    period: "month",
  },
};

export const EnterpriseWithTotal: Story = {
  args: {
    mode: "enterprise",
    basePrice: 4999,
    seatPrice: 1500,
    totalPrice: 19999,
    currency: "usd",
    period: "year",
    seatCount: 10,
    size: "lg",
  },
};
