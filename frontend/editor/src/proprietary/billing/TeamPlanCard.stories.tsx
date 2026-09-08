import type { Meta, StoryObj } from "@storybook/react-vite";
import { TeamPlanCard } from "@app/billing/TeamPlanCard";
import { subscribedWallet } from "@app/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof TeamPlanCard> = {
  title: "Portal/Billing/TeamPlanCard",
  component: TeamPlanCard,
  parameters: { layout: "padded" },
  args: {
    wallet: subscribedWallet,
    onBuy: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof TeamPlanCard>;

/** No Team plan: the member count plus what Team would add, with the leader's buy action. */
export const NotHeld: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: false, licensedUsers: null, usersInUse: 4 },
    },
  },
};

/** No Team plan, viewed by a member: identical figures, no action to take. */
export const NotHeldMember: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: false, licensedUsers: null, usersInUse: 4 },
    },
    onBuy: undefined,
  },
};

/** Held with room to spare: the capacity meter well inside its limit. */
export const Healthy: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 34 },
    },
  },
};

/** Past 80% of the licensed count, where the meter changes band. */
export const NearlyFull: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 87 },
    },
  },
};

/** Exactly at the limit: the next signup is the one that gets refused. */
export const Full: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 100 },
    },
  },
};

/**
 * More members than the plan covers. Reachable by a downgrade, a cancellation or a lapsed card,
 * since the roster is never cut retroactively, so it reads as a state rather than an error.
 */
export const OverCapacity: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 137 },
    },
  },
};

/** Held with no user limit: a count with no denominator, and no bar to mislead about headroom. */
export const Unlimited: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: null, usersInUse: 240 },
    },
  },
};
