import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpendThisMonthCard } from "@processor/components/billing/SpendThisMonthCard";
import { subscribedWallet } from "@processor/components/billing/walletFixtures";
import "@processor/components/billing/billing.css";

const meta: Meta<typeof SpendThisMonthCard> = {
  title: "Processor/Billing/SpendThisMonthCard",
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
