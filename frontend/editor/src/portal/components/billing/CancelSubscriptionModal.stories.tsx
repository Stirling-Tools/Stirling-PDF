import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { CancelSubscriptionModal } from "@portal/components/billing/CancelSubscriptionModal";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const state = (product: "team" | "processor", cancelling: boolean) => ({
  product,
  subscriptionId: `sub_${product}`,
  status: "active",
  cancelling,
  endsAt: cancelling ? "2026-11-14T00:00:00.000Z" : null,
  periodEnd: "2026-11-14T00:00:00.000Z",
});

/**
 * The in-app cancel flow: reason, one "before you go" step, confirm. The mocked endpoints answer
 * every action, so the whole flow can be clicked through, including the message to the team.
 */
const meta: Meta<typeof CancelSubscriptionModal> = {
  title: "Portal/Billing/CancelSubscriptionModal",
  component: CancelSubscriptionModal,
  args: {
    open: true,
    onClose: () => console.log("close"),
    onChanged: (states) => console.log("changed", states),
    onLowerSpendLimit: () => console.log("spend limit"),
    email: "alex@acme.example",
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 37 },
      processor: { active: true },
    },
  },
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get("http://saas.mock/api/v1/payg/subscriptions", () =>
          HttpResponse.json({
            subscriptions: [state("team", false), state("processor", false)],
          }),
        ),
        http.post("http://saas.mock/api/v1/payg/subscriptions/cancel", () =>
          HttpResponse.json({
            subscriptions: [state("team", true), state("processor", false)],
          }),
        ),
        http.post("http://saas.mock/api/v1/payg/subscriptions/resume", () =>
          HttpResponse.json({
            subscriptions: [state("team", false), state("processor", false)],
          }),
        ),
        http.post("http://saas.mock/api/v1/payg/subscriptions/contact", () =>
          HttpResponse.json({ sent: true }),
        ),
      ],
    },
  },
};
export default meta;

type Story = StoryObj<typeof CancelSubscriptionModal>;

export const TeamAndProcessor: Story = {};

export const TeamOnly: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 3 },
      processor: { active: false },
    },
  },
};

export const ProcessorWithPrepaidCredits: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: false, licensedUsers: null, usersInUse: 4 },
      processor: { active: true },
      prepaidUnitsRemaining: 78000,
    },
  },
};
