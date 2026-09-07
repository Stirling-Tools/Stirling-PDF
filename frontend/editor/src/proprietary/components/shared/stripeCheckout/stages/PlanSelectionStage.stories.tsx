import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlanSelectionStage } from "@app/components/shared/stripeCheckout/stages/PlanSelectionStage";
import { PlanTierGroup } from "@app/services/licenseService";

/**
 * The plan-selection step of the Stripe checkout flow, letting the user
 * choose between monthly and yearly billing for the selected plan tier.
 */
const serverPlanGroup: PlanTierGroup = {
  tier: "server",
  name: "Server",
  monthly: {
    id: "server-monthly",
    name: "Server",
    price: 29,
    currency: "£",
    period: "month",
    features: [],
    highlights: [],
    lookupKey: "selfhosted:server:monthly",
  },
  yearly: {
    id: "server-yearly",
    name: "Server",
    price: 290,
    currency: "£",
    period: "year",
    features: [],
    highlights: [],
    lookupKey: "selfhosted:server:yearly",
  },
  features: [],
  highlights: [],
};

const enterprisePlanGroup: PlanTierGroup = {
  tier: "enterprise",
  name: "Enterprise",
  monthly: {
    id: "enterprise-monthly",
    name: "Enterprise",
    price: 499,
    currency: "£",
    period: "month",
    features: [],
    highlights: [],
    seatPrice: 15,
    requiresSeats: true,
    lookupKey: "selfhosted:enterprise:monthly",
  },
  yearly: {
    id: "enterprise-yearly",
    name: "Enterprise",
    price: 4999,
    currency: "£",
    period: "year",
    features: [],
    highlights: [],
    seatPrice: 150,
    requiresSeats: true,
    lookupKey: "selfhosted:enterprise:yearly",
  },
  features: [],
  highlights: [],
};

const meta = {
  title: "StripeCheckout/PlanSelectionStage",
  component: PlanSelectionStage,
  args: {
    planGroup: serverPlanGroup,
    minimumSeats: 1,
    savings: null,
    onSelectPlan: () => {},
  },
} satisfies Meta<typeof PlanSelectionStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSavings: Story = {
  args: {
    savings: {
      amount: 58,
      percent: 20,
      currency: "£",
    },
  },
};

export const Enterprise: Story = {
  args: {
    planGroup: enterprisePlanGroup,
    minimumSeats: 5,
    savings: {
      amount: 900,
      percent: 15,
      currency: "£",
    },
  },
};
