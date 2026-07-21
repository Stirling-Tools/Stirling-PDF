import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcurementAgreement } from "@portal/components/procurement/ProcurementAgreement";
import type { QuoteResult } from "@portal/api/procurement";
import "@portal/views/Procurement.css";

const quote: QuoteResult = {
  quoteId: 488,
  quoteNumber: "Q-2026-0488",
  status: "sent",
  currency: "USD",
  annualNetMinor: 8_400_000,
  tcvMinor: 25_200_000,
  renewalAnnualNetMinor: 8_652_000,
  cpiRatePct: 3,
  lineItems: [
    {
      key: "platform",
      label: "Platform subscription",
      kind: "RECURRING",
      amountMinor: 6_000_000,
    },
    {
      key: "support",
      label: "Premium support",
      kind: "RECURRING",
      amountMinor: 1_800_000,
    },
    {
      key: "onboarding",
      label: "Onboarding services",
      kind: "ONE_TIME",
      amountMinor: 500_000,
    },
    {
      key: "loyalty",
      label: "Multi-year loyalty discount",
      kind: "DISCOUNT",
      amountMinor: -300_000,
    },
    { key: "sso", label: "SSO / SCIM", kind: "INCLUDED", amountMinor: 0 },
  ],
  validUntil: "2026-08-15",
  stripeQuoteId: "qt_1NWnd488",
  invoiceUrl: null,
  invoicePdf: null,
  config: {
    volume: 500,
    users: 25,
    intensity: 4,
    sizeMult: 1.4,
    deployment: "cloud",
    termYears: 3,
    serviceLevel: "standard",
    indemnification: true,
    training: false,
    qbr: true,
    businessName: "Northwind Logistics",
  },
};

/**
 * The final agreement (security) step: the combined Master Service Agreement + Order Form + EULA +
 * DPA, gated behind an "I agree" checkbox before the buyer can accept the quote.
 */
const meta: Meta<typeof ProcurementAgreement> = {
  title: "Portal/Procurement/ProcurementAgreement",
  component: ProcurementAgreement,
  parameters: { layout: "padded" },
  args: {
    quote,
    busy: false,
    downloading: false,
    onAgree: () => {},
    onDownload: () => {},
    onEdit: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof ProcurementAgreement>;

export const Default: Story = {};

// Agreeing: the primary CTA shows its loading state while the accept call is in flight.
export const Agreeing: Story = {
  args: { busy: true },
};

// Downloading: the secondary action shows its loading state instead.
export const Downloading: Story = {
  args: { downloading: true },
};
