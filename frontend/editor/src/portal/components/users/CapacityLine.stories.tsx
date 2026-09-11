import type { Meta, StoryObj } from "@storybook/react-vite";
import { CapacityLine } from "@portal/components/users/CapacityLine";
import { resolveUserCapacity } from "@app/billing";

/** What `calculateMaxAllowedUsers()` returns for a licence with `users: 0`. */
const JAVA_INT_MAX = 2147483647;

const meta: Meta<typeof CapacityLine> = {
  title: "Portal/Users/CapacityLine",
  component: CapacityLine,
  parameters: { layout: "padded" },
  args: {
    capacity: resolveUserCapacity({
      used: 64,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
    }),
    onAddCapacity: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof CapacityLine>;

/** Team plan with room to spare. */
export const Healthy: Story = {};

/**
 * A legacy Server licence. The limit arrives as `Integer.MAX_VALUE`, so the line has to
 * say only how many users there are, and offer nothing to buy.
 */
export const Unlimited: Story = {
  args: {
    capacity: resolveUserCapacity({
      used: 64,
      maxAllowedUsers: JAVA_INT_MAX,
      premiumEnabled: true,
    }),
  },
};

/** Past 80 percent of the limit. */
export const NearLimit: Story = {
  args: {
    capacity: resolveUserCapacity({
      used: 186,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
    }),
  },
};

/**
 * Full, with disabled accounts and unredeemed invites making up part of the count. Both
 * hold a slot, so the count is higher than the visible roster and the note explains why.
 */
export const AtCapacityWithHeldSlots: Story = {
  args: {
    capacity: resolveUserCapacity({
      used: 200,
      maxAllowedUsers: 200,
      serverQuantity: 2,
      userBlockSize: 100,
      premiumEnabled: true,
      disabled: 14,
      pendingInvites: 6,
    }),
  },
};

/** Enterprise buys seats, not blocks, so the action names the seat flow. */
export const Seats: Story = {
  args: {
    capacity: resolveUserCapacity({
      used: 64,
      maxAllowedUsers: 250,
      premiumEnabled: true,
    }),
  },
};

/** No licence: the limit is the free allowance. */
export const Free: Story = {
  args: {
    capacity: resolveUserCapacity({
      used: 4,
      maxAllowedUsers: 5,
      premiumEnabled: false,
    }),
  },
};

/** A build with no way to buy: the line is text only. */
export const NoPurchasePath: Story = {
  args: { onAddCapacity: undefined },
};
