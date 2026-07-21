import type { Meta, StoryObj } from "@storybook/react-vite";
import { FreePlanView } from "@portal/components/billing/FreePlanView";
import { freeWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof FreePlanView> = {
  title: "Portal/Billing/FreePlanView",
  component: FreePlanView,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof FreePlanView>;

/** Leader — free meter + the "Turn on Processor" CTA (opens embedded checkout on click). */
export const Leader: Story = {
  args: { wallet: freeWallet },
};

/** Member — sees the explainer but not the enable CTA. */
export const Member: Story = {
  args: { wallet: { ...freeWallet, role: "member" } },
};
