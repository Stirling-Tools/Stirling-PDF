import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { StripeCheckoutModal } from "@portal/components/billing/StripeCheckoutModal";
import "@portal/components/billing/billing.css";

/**
 * Two-step "turn on the Processor" flow. Step 1 sets the monthly spend cap
 * (its own page, since Stripe owns the card iframe on step 2). Storybook has no
 * Stripe key, so step 2 renders the card placeholder rather than the live
 * embedded form.
 */
const meta: Meta<typeof StripeCheckoutModal> = {
  title: "Portal/Billing/StripeCheckoutModal",
  component: StripeCheckoutModal,
  args: {
    open: true,
    onClose: () => console.log("close"),
    teamId: 1,
    currency: "usd",
    pricePerDocMinor: 1,
    initialCapUsd: 100,
    onComplete: () => Promise.resolve(true),
  },
  // Let the cap step's "Continue" succeed so the flow can advance to payment.
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.patch(
          "http://saas.mock/api/v1/payg/cap",
          () => new HttpResponse(null, { status: 204 }),
        ),
      ],
    },
  },
};
export default meta;
type Story = StoryObj<typeof StripeCheckoutModal>;

/** Step 1 — set the monthly spend limit before adding a card. */
export const SetCap: Story = {};

/** Step 1 seeded with no cap (uncapped) selected. */
export const Uncapped: Story = { args: { initialCapUsd: null } };
