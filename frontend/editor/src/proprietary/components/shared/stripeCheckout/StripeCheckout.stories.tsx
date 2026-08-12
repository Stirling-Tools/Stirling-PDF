import type { Meta, StoryObj } from "@storybook/react-vite";
import StripeCheckout from "@app/components/shared/stripeCheckout/StripeCheckout";
import type { PlanTierGroup } from "@app/services/licenseService";

const PLAN_GROUP: PlanTierGroup = {
  tier: "server",
  name: "Server",
  monthly: {
    id: "server-monthly",
    name: "Server Monthly",
    price: 29,
    currency: "usd",
    period: "monthly",
    features: [],
    highlights: ["Unlimited documents", "Priority support"],
    lookupKey: "selfhosted:server:monthly",
  },
  yearly: {
    id: "server-yearly",
    name: "Server Yearly",
    price: 290,
    currency: "usd",
    period: "yearly",
    features: [],
    highlights: ["Unlimited documents", "Priority support", "2 months free"],
    lookupKey: "selfhosted:server:yearly",
  },
  features: [],
  highlights: ["Unlimited documents", "Priority support"],
};

/**
 * The multi-stage Stripe checkout modal (email -> plan selection -> payment -> success/error).
 */
const meta: Meta<typeof StripeCheckout> = {
  title: "StripeCheckout/StripeCheckout",
  component: StripeCheckout,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    planGroup: PLAN_GROUP,
    minimumSeats: 1,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HostedCheckoutSuccess: Story = {
  args: {
    hostedCheckoutSuccess: {
      isUpgrade: false,
      licenseKey: "STIRLING-XXXX-XXXX-XXXX",
    },
  },
};
