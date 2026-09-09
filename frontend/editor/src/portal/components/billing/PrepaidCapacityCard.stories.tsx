import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrepaidCapacityCard } from "@portal/components/billing/PrepaidCapacityCard";
import {
  subscribedWallet,
  prepaidWallet,
} from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof PrepaidCapacityCard> = {
  title: "Portal/Billing/PrepaidCapacityCard",
  component: PrepaidCapacityCard,
  parameters: { layout: "padded" },
  args: {
    wallet: subscribedWallet,
    onBuy: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PrepaidCapacityCard>;

/** No bundle yet — the "12 months for the price of 10" offer nudge (leader view). */
export const OfferNudge: Story = {
  args: {
    wallet: subscribedWallet,
  },
};

/** Bundle held, plenty of capacity left — meter + "Top up" action (leader view). */
export const BundleHealthy: Story = {
  args: {
    wallet: prepaidWallet,
  },
};

/** Bundle nearly drawn down — meter crosses into the "Running low" band. */
export const BundleLow: Story = {
  args: {
    wallet: {
      ...prepaidWallet,
      prepaidUnitsRemaining: 10_000,
    },
  },
};
