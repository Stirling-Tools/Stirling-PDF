import type { Meta, StoryObj } from "@storybook/react-vite";
import { WalletMeter } from "@portal/components/billing/WalletMeter";
import { freeWallet, subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof WalletMeter> = {
  title: "Portal/Billing/WalletMeter",
  component: WalletMeter,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof WalletMeter>;

/** Free grant, plenty left (< 80% used) → FULL band. */
export const FreePlentyLeft: Story = {
  args: { wallet: { ...freeWallet, freeRemaining: 380 } },
};

/** Free grant approaching the limit (≥ 80%) → WARNED band. */
export const FreeApproachingLimit: Story = {
  args: { wallet: { ...freeWallet, freeRemaining: 60 } },
};

/** Free grant exhausted → DEGRADED band. */
export const FreeLimitReached: Story = {
  args: { wallet: { ...freeWallet, freeRemaining: 0, billableUsed: 500 } },
};

/** Subscribed, within cap → spend-vs-cap meter, no status chip. */
export const SubscribedWithinCap: Story = {
  args: { wallet: subscribedWallet },
};

/** Subscribed, no cap → "$X / no cap", bar hidden. */
export const SubscribedUncapped: Story = {
  args: { wallet: { ...subscribedWallet, noCap: true, capUsd: null } },
};
