import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpendCapControl } from "@portal/components/billing/SpendCapControl";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof SpendCapControl> = {
  title: "Portal/Billing/SpendCapControl",
  component: SpendCapControl,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SpendCapControl>;

/** Leader — preset chips, custom pill, the cap→PDF estimate, and the cap-reached disclosure. */
export const LeaderCapped: Story = {
  args: { wallet: subscribedWallet },
};

/** Leader on a custom (non-preset) cap — the custom pill is active. */
export const LeaderCustomCap: Story = {
  args: { wallet: { ...subscribedWallet, capUsd: 1234 } },
};

/** Leader, no cap set. */
export const LeaderNoCap: Story = {
  args: { wallet: { ...subscribedWallet, noCap: true, capUsd: null } },
};

/** Member — read-only display + the disclosure; only the owner can change the cap. */
export const MemberReadOnly: Story = {
  args: { wallet: { ...subscribedWallet, role: "member" } },
};

/** Estimate hidden when the per-doc rate isn't resolved on the wallet. */
export const RateUnknown: Story = {
  args: { wallet: { ...subscribedWallet, pricePerDocMinor: null } },
};
