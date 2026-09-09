import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { InvoicesList } from "@portal/components/billing/InvoicesList";
import type { Invoice } from "@portal/api/billing";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof InvoicesList> = {
  title: "Portal/Billing/InvoicesList",
  component: InvoicesList,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof InvoicesList>;

function invoice(overrides: Partial<Invoice> & { id: string }): Invoice {
  return {
    number: null,
    status: "paid",
    totalMinor: 4900,
    currency: "usd",
    createdAt: "2026-06-01T00:00:00Z",
    periodStart: "2026-05-01T00:00:00Z",
    periodEnd: "2026-06-01T00:00:00Z",
    hostedInvoiceUrl: "https://invoice.stripe.com/i/mock",
    invoicePdf: "https://invoice.stripe.com/i/mock/pdf",
    description: "Stirling Processor Plan",
    pdfsProcessed: 1204,
    ...overrides,
  };
}

const SEVEN_INVOICES: Invoice[] = Array.from({ length: 7 }, (_, i) =>
  invoice({
    id: `in_mock_${i}`,
    number: `INV-${1000 + i}`,
    status: i === 0 ? "open" : "paid",
    createdAt: `2026-0${(i % 6) + 1}-01T00:00:00Z`,
  }),
);

/** A handful of recent invoices — the common case. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/payg/invoices", () =>
          HttpResponse.json(SEVEN_INVOICES),
        ),
      ],
    },
  },
};

/** No invoices yet — free team or a subscription with no closed cycle. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/payg/invoices", () => HttpResponse.json([])),
      ],
    },
  },
};

/** Fetch fails — the inline error message renders instead of the table. */
export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(
          "*/api/v1/payg/invoices",
          () => new HttpResponse(null, { status: 500 }),
        ),
      ],
    },
  },
};
