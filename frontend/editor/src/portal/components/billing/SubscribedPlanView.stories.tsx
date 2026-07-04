import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { SubscribedPlanView } from "@portal/components/billing/SubscribedPlanView";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const card = http.get("*/api/v1/payg/payment-method", () =>
  HttpResponse.json({
    present: true,
    brand: "visa",
    last4: "4242",
    expMonth: 8,
    expYear: 2027,
  }),
);

const invoices = http.get("*/api/v1/payg/invoices", () =>
  HttpResponse.json([
    {
      id: "in_6",
      number: "INV-2026-006",
      status: "open",
      totalMinor: 714235,
      currency: "usd",
      createdAt: "2026-06-01T00:00:00Z",
      periodStart: "2026-06-01T00:00:00Z",
      periodEnd: "2026-06-30T00:00:00Z",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/test_6",
      invoicePdf: "https://invoice.stripe.com/i/test_6/pdf",
      description: "Stirling Processor Plan",
      pdfsProcessed: 142847,
    },
    {
      id: "in_5",
      number: "INV-2026-005",
      status: "paid",
      totalMinor: 691085,
      currency: "usd",
      createdAt: "2026-05-01T00:00:00Z",
      periodStart: "2026-05-01T00:00:00Z",
      periodEnd: "2026-05-31T00:00:00Z",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/test_5",
      invoicePdf: "https://invoice.stripe.com/i/test_5/pdf",
      description: "Stirling Processor Plan",
      pdfsProcessed: 138217,
    },
    {
      id: "in_4",
      number: "INV-2026-004",
      status: "paid",
      totalMinor: 650515,
      currency: "usd",
      createdAt: "2026-04-01T00:00:00Z",
      periodStart: "2026-04-01T00:00:00Z",
      periodEnd: "2026-04-30T00:00:00Z",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/test_4",
      invoicePdf: "https://invoice.stripe.com/i/test_4/pdf",
      description: "Stirling Processor Plan",
      pdfsProcessed: 130103,
    },
  ]),
);

const meta: Meta<typeof SubscribedPlanView> = {
  title: "Portal/Billing/SubscribedPlanView",
  component: SubscribedPlanView,
  parameters: { layout: "padded", msw: { handlers: [card, invoices] } },
};
export default meta;
type Story = StoryObj<typeof SubscribedPlanView>;

/** The full Processor-plan dashboard — leader, within cap. */
export const Leader: Story = { args: { wallet: subscribedWallet } };

/** Approaching the cap — surfaces the over-cap warning banner + projection. */
export const ApproachingCap: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      estimatedBillMinor: 85_000,
      billableUsed: 42_500,
      spendUnitsThisPeriod: 42_500,
    },
  },
};
