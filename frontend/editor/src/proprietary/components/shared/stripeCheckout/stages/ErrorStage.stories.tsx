import type { Meta, StoryObj } from "@storybook/react";
import { ErrorStage } from "@app/components/shared/stripeCheckout/stages/ErrorStage";

/**
 * The error state shown when a Stripe checkout attempt fails.
 */
const meta = {
  title: "StripeCheckout/ErrorStage",
  component: ErrorStage,
  parameters: { layout: "centered" },
  args: {
    error: "Your card was declined. Please try a different payment method.",
    onClose: () => {},
  },
} satisfies Meta<typeof ErrorStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NetworkError: Story = {
  args: {
    error:
      "We couldn't reach the payment provider. Please check your connection and try again.",
  },
};
