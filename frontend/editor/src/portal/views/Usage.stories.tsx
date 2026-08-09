import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { Usage } from "@portal/views/Usage";
import type { Wallet } from "@portal/api/billing";
import {
  freeWallet,
  subscribedWallet,
} from "@portal/components/billing/walletFixtures";

/**
 * Usage & billing. The page is a thin shell — header, notices, and one of two
 * plan views — that dispatches entirely on the wallet it loads:
 *
 *   free       → the free-grant meter plus the pay-as-you-go explainer
 *   subscribed → the period meter, spend cap, members and invoices, and the
 *                "Manage Payment" action in the header
 *
 * So the wallet response is what these stories vary. A failed read replaces the
 * plan view with a banner; while the read is in flight the body is skeletons.
 *
 * One state is not reachable here: the "session expired" notice is raised when
 * there is no SaaS token at all, which the Storybook preview always supplies.
 */
const wallet = (body: Wallet) =>
  http.get("*/api/v1/payg/wallet", () => HttpResponse.json(body));

/** The subscribed view also reads the card on file and the invoice history. */
const paymentMethod = http.get("*/api/v1/payg/payment-method", () =>
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
  ]),
);

const meta: Meta<typeof Usage> = {
  // AppShell renders every view inside <main>; standalone, this view's
  // own <header> would be promoted to a second banner landmark.
  decorators: [
    (Story: () => React.ReactElement) => (
      <main>
        <Story />
      </main>
    ),
  ],
  title: "Portal/Views/Usage",
  component: Usage,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Usage>;

/** On the one-time free grant: free meter and the "turn on Processor" pitch. */
export const FreePlan: Story = {
  parameters: { msw: { handlers: [wallet(freeWallet)] } },
};

/** Subscribed: period meter, cap, members and invoices, plus the header action. */
export const Subscribed: Story = {
  parameters: {
    msw: { handlers: [wallet(subscribedWallet), paymentMethod, invoices] },
  },
};

/** While the wallet is in flight the body is two skeleton blocks. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/payg/wallet", async () => {
          await delay("infinite");
          return HttpResponse.json(freeWallet);
        }),
      ],
    },
  },
};

/** A failed read: the plan view never mounts and the error banner states why. */
export const WalletUnavailable: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/payg/wallet", () =>
          HttpResponse.json(
            { detail: "Billing service unavailable" },
            {
              status: 503,
            },
          ),
        ),
      ],
    },
  },
};
