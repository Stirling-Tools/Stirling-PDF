import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PaymentSection } from "@portal/components/billing/PaymentSection";
import { freeWallet } from "@app/billing/walletFixtures";

vi.mock("@portal/api/billing", () => ({
  fetchPaymentMethod: async () => ({ present: false }),
  fetchBillingDetails: async () => ({
    present: true,
    upcomingInvoices: [
      {
        subscriptionId: "team",
        description: "Team",
        date: "2026-10-15T12:00:00Z",
      },
      {
        subscriptionId: "processor",
        description: "Processor",
        date: "2026-10-20T12:00:00Z",
      },
    ],
  }),
}));

it("shows each Stripe renewal date instead of the wallet grant reset", async () => {
  render(
    <PaymentSection
      wallet={{ ...freeWallet, billingPeriodEnd: "2026-10-01" }}
    />,
  );
  expect(await screen.findByText(/15 Oct 2026/)).toBeInTheDocument();
  expect(screen.getByText(/20 Oct 2026/)).toBeInTheDocument();
  expect(screen.getByText("Team")).toBeInTheDocument();
  expect(screen.queryByText(/1 Oct 2026/)).not.toBeInTheDocument();
});
