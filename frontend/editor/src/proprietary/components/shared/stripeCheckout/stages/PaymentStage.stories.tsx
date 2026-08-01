import type { Meta, StoryObj } from "@storybook/react-vite";
import { PaymentStage } from "@app/components/shared/stripeCheckout/stages/PaymentStage";
import type { PlanTier } from "@app/services/licenseService";

const serverPlan: PlanTier = {
  id: "server-monthly",
  name: "Server",
  price: 29,
  currency: "£",
  period: "month",
  features: [],
  highlights: [],
  lookupKey: "selfhosted:server:monthly",
};

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
    clientSecret: "demo-client-secret-xxxx",
    selectedPlan: serverPlan,
  },
};
