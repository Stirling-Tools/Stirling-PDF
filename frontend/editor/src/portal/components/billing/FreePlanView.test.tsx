import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FreePlanView } from "@portal/components/billing/FreePlanView";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
import type { LatestBundleQuote } from "@portal/billing/stripe";

const api = vi.hoisted(() => ({
  fetchBundlePricing: vi.fn(),
  getLatestBundleQuote: vi.fn(),
  cancelBundleQuote: vi.fn(),
  createBundleStripeQuote: vi.fn(),
  acceptBundleStripeQuote: vi.fn(),
  upsertBundleQuote: vi.fn(),
  createCheckoutSession: vi.fn(),
}));
vi.mock("@portal/billing/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@portal/billing/stripe")>()),
  ...api,
  getStripePublishableKey: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const savedQuote: LatestBundleQuote = {
  quoteId: 7,
  users: 25,
  posturePolicies: 4,
  sizeMult: 1.2,
  pipelineMult: 1,
  poolCredits: 576000,
  priceMinor: 480000,
  currency: "usd",
  consentedAt: null,
  stripeQuoteId: "qt_test",
  stripeQuoteNumber: "QT-0007",
  stripeRef: null,
  validUntil: "2099-01-01T00:00:00Z",
};

function ResumedActivation() {
  const [step, setStep] = useState<"choose" | "prepay" | "payg" | null>(
    "prepay",
  );
  return (
    <FreePlanView wallet={freeWallet} step={step} onStepChange={setStep} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getLatestBundleQuote.mockResolvedValue(savedQuote);
  api.fetchBundlePricing.mockResolvedValue({
    currency: "usd",
    unitAmountMinor: 1,
  });
});

describe("Processor activation navigation", () => {
  it("returns from a saved quote to monthly limit selection without cancelling or purchasing", async () => {
    render(
      <MantineProvider>
        <ResumedActivation />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Pay as you go" }));
    const limit = screen.getByRole("textbox", { name: "Monthly spend limit" });
    fireEvent.change(limit, { target: { value: "250" } });
    expect(limit).toHaveValue("250");
    expect(api.cancelBundleQuote).not.toHaveBeenCalled();
    expect(api.acceptBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns from the monthly limit to the same annual quote without minting another", async () => {
    render(
      <MantineProvider>
        <ResumedActivation />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Pay as you go" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepay a year" }));
    expect(
      await screen.findByText("Calculate your annual payment"),
    ).toBeInTheDocument();
    expect(api.getLatestBundleQuote).toHaveBeenCalledTimes(2);
    expect(api.cancelBundleQuote).not.toHaveBeenCalled();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.upsertBundleQuote).not.toHaveBeenCalled();
  });

  it("keeps Cancel for a subscribed team's standalone top-up", async () => {
    const onClose = vi.fn();
    render(
      <MantineProvider>
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={onClose} />
      </MantineProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Pay as you go" }),
    ).not.toBeInTheDocument();
  });

  it("reprices an unaccepted USD quote at the customer's GBP rate before checkout", async () => {
    api.fetchBundlePricing.mockResolvedValue({
      currency: "gbp",
      unitAmountMinor: 0.75,
    });
    api.upsertBundleQuote.mockResolvedValue({ quoteId: 7 });
    api.createBundleStripeQuote.mockResolvedValue({
      stripeQuoteId: "qt_gbp",
      stripeQuoteNumber: null,
    });
    render(
      <MantineProvider>
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    expect(await screen.findByText("£3,600.00")).toBeInTheDocument();
    expect(screen.queryByText("$4,800.00")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await waitFor(() =>
      expect(api.upsertBundleQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "gbp",
          priceMinor: 360000,
          poolCredits: 576000,
        }),
      ),
    );
    expect(api.createBundleStripeQuote).toHaveBeenCalledOnce();
  });

  it("blocks new purchases when authoritative pricing cannot be loaded", async () => {
    api.fetchBundlePricing.mockRejectedValue(new Error("Pricing unavailable"));
    render(
      <MantineProvider>
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    expect(await screen.findByText("Pricing unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to payment" }),
    ).toBeDisabled();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();
  });

  it("keeps an issued GBP invoice accessible even when current pricing is unavailable", async () => {
    api.fetchBundlePricing.mockRejectedValue(new Error("Pricing unavailable"));
    api.getLatestBundleQuote.mockResolvedValue({
      ...savedQuote,
      currency: "gbp",
      stripeRef: "in_existing",
    });
    api.acceptBundleStripeQuote.mockResolvedValue({
      invoiceId: "in_existing",
      status: "open",
      invoicePdf: null,
      hostedInvoiceUrl: null,
    });
    render(
      <MantineProvider>
        <BundleCheckoutModal open wallet={subscribedWallet} onClose={vi.fn()} />
      </MantineProvider>,
    );
    expect(
      await screen.findByRole("button", { name: "Pay online" }),
    ).toBeEnabled();
    expect(screen.getByText("£4,800.00")).toBeInTheDocument();
    expect(screen.queryByText("Pricing unavailable")).not.toBeInTheDocument();
    expect(api.createBundleStripeQuote).not.toHaveBeenCalled();
    expect(api.upsertBundleQuote).not.toHaveBeenCalled();
  });
});
