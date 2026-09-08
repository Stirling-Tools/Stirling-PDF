import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@app/ui";
import { BillingScreen } from "@app/billing/BillingScreen";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
// The class vocabulary this screen emits is host-supplied, the same arrangement MeterBar uses.
// The portal is the first host, so its stylesheets are what these stories render against.
import "@portal/views/Usage.css";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof BillingScreen> = {
  title: "Billing/BillingScreen",
  component: BillingScreen,
  parameters: { layout: "fullscreen" },
  args: {
    wallet: subscribedWallet,
  },
};
export default meta;
type Story = StoryObj<typeof BillingScreen>;

const managePayment = (
  <Button variant="secondary" fat>
    Manage Payment
  </Button>
);

/**
 * Cloud, nothing bought yet. Both products offer themselves; the free grant is the Processor's
 * whole story until it is switched on.
 */
export const CloudFree: Story = {
  args: {
    wallet: {
      ...freeWallet,
      team: { held: false, licensedUsers: null, usersInUse: 3 },
      processor: { active: false },
    },
    onBuyTeam: () => {},
    onActivateProcessor: () => {},
  },
};

/** Cloud, both products held. The case a single free/subscribed axis could never describe. */
export const CloudBothProducts: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 34 },
      processor: { active: true },
    },
    headerAction: managePayment,
    onBuyTeam: () => {},
  },
};

/**
 * Self-hosted, linked. Team is bought, the Processor is not, and the instance is carrying units
 * the cloud has not billed yet, which is a fact only this edition has.
 */
export const SelfHostedTeamOnly: Story = {
  args: {
    wallet: {
      ...freeWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 62 },
      processor: { active: false },
    },
    pendingUnits: 148,
    headerAction: managePayment,
    onBuyTeam: () => {},
    onActivateProcessor: () => {},
  },
};

/**
 * Over capacity: more members than the plan covers, reachable by a downgrade, a cancellation or a
 * lapsed card. The roster is never cut retroactively, so this is a state the screen has to hold.
 */
export const OverCapacity: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 137 },
      processor: { active: true },
    },
    headerAction: managePayment,
    onBuyTeam: () => {},
  },
};

/** A member rather than a leader: same figures, no action callbacks, so nothing is offered. */
export const MemberReadOnly: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      role: "member",
      team: { held: true, licensedUsers: 100, usersInUse: 34 },
      processor: { active: true },
    },
  },
};

/** Unlimited Team with no spend limit on the Processor: two figures, neither with a denominator. */
export const NoLimits: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: null, usersInUse: 240 },
      processor: { active: true },
      noCap: true,
      capUsd: null,
    },
    headerAction: managePayment,
  },
};

/** While the wallet loads. */
export const Loading: Story = {
  args: { wallet: null, loading: true },
};
