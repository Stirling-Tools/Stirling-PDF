import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildWalletContract } from "@portal/mocks/usage";
import { WalletContractCard } from "@portal/components/usage/WalletContractCard";
import "@portal/views/Usage.css";

const meta: Meta<typeof WalletContractCard> = {
  title: "Portal/Usage/WalletContractCard",
  component: WalletContractCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof WalletContractCard>;

/** Free: no subscription, free grant nearly spent, approaching limit. */
export const FreeGrant: Story = {
  args: { wallet: buildWalletContract("free") },
};

/** Pro: active subscription, capped, comfortably under. */
export const Subscribed: Story = {
  args: { wallet: buildWalletContract("pro") },
};

/** Enterprise: active, uncapped, full service. */
export const Uncapped: Story = {
  args: { wallet: buildWalletContract("enterprise") },
};

/** Degraded: cap reached / past due — gate enforces degraded service. */
export const Degraded: Story = {
  args: {
    wallet: {
      subscriptionStatus: "past_due",
      freeUnitsRemaining: 0,
      monthlyCapUnits: 50_000,
      periodSpend: 50_000,
      state: "DEGRADED",
    },
  },
};
