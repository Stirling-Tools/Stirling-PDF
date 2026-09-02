import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CapacityStage } from "@app/components/shared/stripeCheckout/stages/CapacityStage";
import { PlanTier } from "@app/services/licenseService";

/**
 * The capacity step of the Stripe checkout, between billing period and payment. Only the Server
 * tier reaches it: the stepper counts servers, and every figure beside it is stated in users.
 */
const yearlyPlan: PlanTier = {
  id: "server-yearly",
  name: "Server",
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

/** A fresh purchase: one server, 100 users. */
export const SingleServer: Story = {};

/** Three servers on the monthly plan, so the total is three times the unit price. */
export const MultipleServersMonthly: Story = {
  args: { selectedPlan: monthlyPlan, serverQuantity: 3 },
};

/**
 * An installation already running 240 users cannot buy fewer than three servers. Reducing capacity
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
 * At five servers the enterprise quote is offered beside the purchase. It is an option, never a
 * wall: self-serve checkout still completes.
 */
export const OffersEnterpriseQuote: Story = {
  args: { serverQuantity: 5, onContactSales: () => {} },
};
