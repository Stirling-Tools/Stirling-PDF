import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { PaymentMethodCard } from "@portal/components/billing/PaymentMethodCard";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof PaymentMethodCard> = {
  title: "Portal/Billing/PaymentMethodCard",
  component: PaymentMethodCard,
  args: { onManage: () => {} },
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PaymentMethodCard>;

/** Card present in the Stripe mirror. */
export const WithCard: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/payg/payment-method", () =>
          HttpResponse.json({
            present: true,
            brand: "visa",
            last4: "4242",
            expMonth: 8,
            expYear: 2027,
          }),
        ),
      ],
    },
  },
};

/** Mirror carries no card (table not synced / no card on file) — neutral fallback. */
export const ManagedInStripe: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/payg/payment-method", () =>
          HttpResponse.json({
            present: false,
            brand: null,
            last4: null,
            expMonth: null,
            expYear: null,
          }),
        ),
      ],
    },
  },
};
