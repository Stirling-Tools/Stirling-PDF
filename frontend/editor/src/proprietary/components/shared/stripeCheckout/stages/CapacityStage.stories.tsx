import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CapacityStage } from "@app/components/shared/stripeCheckout/stages/CapacityStage";
import { PlanTier } from "@app/services/licenseService";

/**
 * The capacity step of the Stripe checkout, between billing period and payment. Only the Team tier
 * reaches it: the buyer picks users, and the plan is priced per block of 100.
 */
const yearlyPlan: PlanTier = {
  id: "server-yearly",
  name: "Team",
  price: 990,
  currency: "$",
  period: "/year",
  features: [],
  highlights: [],
  lookupKey: "selfhosted:server:yearly",
};

const monthlyPlan: PlanTier = {
  ...yearlyPlan,
  id: "server-monthly",
  price: 99,
  period: "/month",
};

const meta = {
  title: "StripeCheckout/CapacityStage",
  component: CapacityStage,
  args: {
    selectedPlan: yearlyPlan,
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

/** A fresh purchase: the smallest block, 100 users. */
export const SingleBlock: Story = {};

/** 300 users on the monthly plan, so the total is three block prices. */
export const ThreeBlocksMonthly: Story = {
  args: { selectedPlan: monthlyPlan, serverQuantity: 3 },
};

/**
 * An installation already running 240 users cannot buy cover for fewer than 300. Reducing capacity
 * is a renewal conversation, not something checkout does by stranding accounts.
 */
export const ConstrainedByCurrentUsers: Story = {
  args: { serverQuantity: 3, currentUsers: 240 },
};

/** Below the minimum the continue button is blocked and the reason is stated. */
export const BelowCurrentUsage: Story = {
  args: { serverQuantity: 1, currentUsers: 240 },
};

/**
 * At the self-serve maximum the enterprise quote is offered beside the purchase. It is an option,
 * never a wall: self-serve checkout still completes.
 */
export const OffersEnterpriseQuote: Story = {
  args: { serverQuantity: 5, onContactSales: () => {} },
};
