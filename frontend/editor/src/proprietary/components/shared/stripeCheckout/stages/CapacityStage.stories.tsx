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

/** Storybook needs the stepper to actually move, so each story owns the quantity. */
function Interactive({
  plan,
  initialQuantity,
  currentUsers,
  withEnterpriseDoor,
}: {
  plan: PlanTier;
  initialQuantity: number;
  currentUsers?: number;
  withEnterpriseDoor?: boolean;
}) {
  const [quantity, setQuantity] = useState(initialQuantity);
  return (
    <CapacityStage
      selectedPlan={plan}
      serverQuantity={quantity}
      setServerQuantity={setQuantity}
      currentUsers={currentUsers}
      onContinue={() => {}}
      onContactSales={withEnterpriseDoor ? () => {} : undefined}
    />
  );
}

const meta = {
  title: "Proprietary/StripeCheckout/CapacityStage",
  component: CapacityStage,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CapacityStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A fresh purchase: one server, 100 users. */
export const SingleServer: Story = {
  render: () => <Interactive plan={yearlyPlan} initialQuantity={1} />,
};

/** Three servers on the monthly plan, so the total is three times the unit price. */
export const MultipleServersMonthly: Story = {
  render: () => <Interactive plan={monthlyPlan} initialQuantity={3} />,
};

/**
 * An installation already running 240 users cannot buy fewer than three servers. Reducing capacity
 * is a renewal conversation, not something checkout does by stranding accounts.
 */
export const ConstrainedByCurrentUsers: Story = {
  render: () => (
    <Interactive plan={yearlyPlan} initialQuantity={3} currentUsers={240} />
  ),
};

/** Below the minimum the continue button is blocked and the reason is stated. */
export const BelowCurrentUsage: Story = {
  render: () => (
    <Interactive plan={yearlyPlan} initialQuantity={1} currentUsers={240} />
  ),
};

/**
 * At five servers the enterprise quote is offered beside the purchase. It is an option, never a
 * wall: self-serve checkout still completes.
 */
export const OffersEnterpriseQuote: Story = {
  render: () => (
    <Interactive plan={yearlyPlan} initialQuantity={5} withEnterpriseDoor />
  ),
};
