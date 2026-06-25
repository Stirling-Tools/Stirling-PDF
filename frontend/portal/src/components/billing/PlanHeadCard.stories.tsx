import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlanHeadCard } from "@portal/components/billing/PlanHeadCard";
import { freeWallet, subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof PlanHeadCard> = {
  title: "Portal/Billing/PlanHeadCard",
  component: PlanHeadCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PlanHeadCard>;

/** Free (Editor plan) — always-free vs metered split, no period meter. */
export const Free: Story = {
  args: { wallet: freeWallet },
};

/** Subscribed (Processor plan), leader — eyebrow shows the billing period + the embedded meter. */
export const SubscribedLeader: Story = {
  args: { wallet: subscribedWallet },
};

/** Subscribed, member — role pill reads "Member". */
export const SubscribedMember: Story = {
  args: { wallet: { ...subscribedWallet, role: "member" } },
};
