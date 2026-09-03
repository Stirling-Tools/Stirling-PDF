import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpendThisMonthCard } from "@portal/components/billing/SpendThisMonthCard";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof SpendThisMonthCard> = {
  title: "Portal/Billing/SpendThisMonthCard",
  component: SpendThisMonthCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SpendThisMonthCard>;

/** Actual spend + the Enterprise upsell tacked onto the foot. */
export const Default: Story = { args: { wallet: subscribedWallet } };

/** Subscribed with this period's free grant part-spent — shows the free-remaining note. */
export const WithFreeRemaining: Story = {
  args: { wallet: { ...subscribedWallet, freeRemaining: 380 } },
};
