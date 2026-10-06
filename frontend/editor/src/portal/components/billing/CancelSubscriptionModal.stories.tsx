import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { CancelSubscriptionModal } from "@portal/components/billing/CancelSubscriptionModal";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const state = (product: "team" | "processor", cancelling: boolean) => ({
  product,
  subscription_id: `sub_${product}`,
  status: "active",
  cancel_at_period_end: cancelling,
  ends_at: cancelling ? "2026-11-14T00:00:00.000Z" : null,
  period_end: "2026-11-14T00:00:00.000Z",
  interval: "month",
  quantity: 1,
});

/**
 * The in-app cancel flow: reason, one "before you go" step, confirm. The mock edge function answers
 * every action, so the whole flow can be clicked through, including the message to support.
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
        http.post(
          "http://saas.mock/functions/v1/subscription-cancellation",
          async ({ request }) => {
            const body = (await request.json()) as { action: string };
            if (body.action === "contact")
              return HttpResponse.json({ sent: true });
            const cancelling = body.action === "cancel";
            return HttpResponse.json({
              subscriptions: [
                state("team", cancelling),
                state("processor", false),
              ],
            });
          },
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
