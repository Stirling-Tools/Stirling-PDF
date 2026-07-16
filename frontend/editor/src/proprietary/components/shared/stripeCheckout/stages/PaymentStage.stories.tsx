import type { Meta, StoryObj } from "@storybook/react-vite";
import { PaymentStage } from "@app/components/shared/stripeCheckout/stages/PaymentStage";

/**
 * The payment step of the Stripe checkout flow. Renders a loading state while
 * the checkout session is being prepared, then hands off to Stripe's
 * embedded checkout once a client secret is available.
 */
const meta = {
  title: "StripeCheckout/PaymentStage",
  component: PaymentStage,
  parameters: { layout: "centered" },
  args: {
    clientSecret: null,
    selectedPlan: null,
    onPaymentComplete: () => {},
  },
} satisfies Meta<typeof PaymentStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Redirecting: Story = {
  args: {
    clientSecret: "cs_test_123_secret_abc",
    selectedPlan: "server",
  },
};
