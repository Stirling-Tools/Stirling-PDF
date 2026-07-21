import type { Meta, StoryObj } from "@storybook/react-vite";
import { WalletMeter } from "@portal/components/billing/WalletMeter";
import { freeWallet } from "@portal/components/billing/walletFixtures";
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
  // The band keys off used/allowance — 120/500 = 24% → FULL.
  args: { wallet: { ...freeWallet, billableUsed: 120, freeRemaining: 380 } },
};

/** Free grant approaching the limit (≥ 80%) → WARNED band. */
export const FreeApproachingLimit: Story = {
  args: { wallet: { ...freeWallet, billableUsed: 440, freeRemaining: 60 } },
};

/** Free grant exhausted → DEGRADED band. */
export const FreeLimitReached: Story = {
  args: { wallet: { ...freeWallet, billableUsed: 500, freeRemaining: 0 } },
};
