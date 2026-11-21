import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CapacityStage } from "@editor/components/shared/stripeCheckout/stages/CapacityStage";
import { PlanTier } from "@editor/services/licenseService";

const yearlyPlan: PlanTier = {
  id: "server-yearly",
  name: "Team",
  price: 10,
  userBlockSize: 1,
  currency: "$",
  period: "/year",
  features: [],
  highlights: [],
  lookupKey: "selfhosted:teamseat:yearly",
};

const monthlyPlan: PlanTier = {
  ...yearlyPlan,
  id: "server-monthly",
  price: 1,
  lookupKey: "selfhosted:teamseat:monthly",
  period: "/month",
};

const meta = {
  title: "StripeCheckout/CapacityStage",
  component: CapacityStage,
  args: {
    selectedPlan: yearlyPlan,
    capacity: {
      freeUsers: 5,
      legacyUsers: 0,
      quantity: 0,
      maxQuantity: 999999,
    },
    serverQuantity: 1,
    setServerQuantity: () => {},
    onContinue: () => {},
  },
  // The stepper is the point of this stage, so stories own the quantity and let it move.
  render: function Interactive(args) {
    const [quantity, setQuantity] = useState(args.serverQuantity);
    return (
      <CapacityStage
        {...args}
        serverQuantity={quantity}
        setServerQuantity={setQuantity}
      />
    );
  },
} satisfies Meta<typeof CapacityStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleSeat: Story = {};

export const SevenSeatsMonthly: Story = {
  args: { selectedPlan: monthlyPlan, serverQuantity: 7 },
};

export const LegacyBlockTopUp: Story = {
  args: {
    selectedPlan: monthlyPlan,
    serverQuantity: 7,
    currentLimit: 105,
    capacity: {
      freeUsers: 5,
      legacyUsers: 100,
      quantity: 0,
      maxQuantity: 999999,
    },
  },
};

export const ConstrainedByCurrentUsers: Story = {
  args: { serverQuantity: 7, currentUsers: 12 },
};

/** Below the minimum the continue button is blocked and the reason is stated. */
export const BelowCurrentUsage: Story = {
  args: { serverQuantity: 1, currentUsers: 12 },
};

export const OffersEnterpriseQuote: Story = {
  args: { serverQuantity: 995, onContactSales: () => {} },
};
